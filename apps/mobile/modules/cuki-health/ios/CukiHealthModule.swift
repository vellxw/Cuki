import ExpoModulesCore
import HealthKit
import UIKit

public final class CukiHealthModule: Module {
  private let store = HKHealthStore()
  private let iso = ISO8601DateFormatter()
  private func date(_ text: String) throws -> Date {
    let fractional=ISO8601DateFormatter(); fractional.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
    guard let value=fractional.date(from:text) ?? iso.date(from:text) else { throw HealthInputError("Fecha no válida.") }
    return value
  }
  public func definition() -> ModuleDefinition {
    Name("CukiHealth")
    AsyncFunction("isAvailable") { HKHealthStore.isHealthDataAvailable() }
    AsyncFunction("requestPermissions") { (options: [String: Bool]) async throws -> [String: Any] in
      guard HKHealthStore.isHealthDataAvailable() else { throw HealthInputError("Apple Health no está disponible.") }
      var read=Set<HKObjectType>(); var write=Set<HKSampleType>()
      if options["readWeight"] == true { read.insert(HKQuantityType(.bodyMass)) }
      if options["readWorkout"] == true { read.insert(HKObjectType.workoutType()) }
      if options["writeWorkout"] == true { write.insert(HKObjectType.workoutType()) }
      guard !read.isEmpty || !write.isEmpty else { throw HealthInputError("Elegí al menos un tipo de dato.") }
      try await self.store.requestAuthorization(toShare:write,read:read)
      // Apple deliberately does not disclose READ grants. A successful sheet is not a grant.
      let writeStatus=options["writeWorkout"] != true ? "not_requested" : self.store.authorizationStatus(for:HKObjectType.workoutType()) == .sharingAuthorized ? "granted" : "denied"
      return ["requestCompleted":true,"readWeight":options["readWeight"] == true ? "not_disclosed" : "not_requested",
        "readWorkout":options["readWorkout"] == true ? "not_disclosed" : "not_requested","writeWorkout":writeStatus]
    }
    AsyncFunction("readRecords") { (from: String, to: String, options: [String: Bool]) async throws -> [String: Any] in
      let start=try self.date(from); let end=try self.date(to)
      guard end > start && end.timeIntervalSince(start) <= 31*86400 else { throw HealthInputError("Elegí un rango de hasta 31 días.") }
      var output=[[String:Any]](); var truncated=false
      if options["readWeight"] == true {
        let samples=try await self.samples(type:HKQuantityType(.bodyMass),start:start,end:end)
        if samples.count > 2500 { truncated=true }
        for case let item as HKQuantitySample in samples.prefix(2500) {
          output.append(["provider":"healthkit","externalId":item.uuid.uuidString,"source":item.sourceRevision.source.bundleIdentifier,
            "kind":"weight","date":self.iso.string(from:item.startDate),"value":item.quantity.doubleValue(for:.gramUnit(with:.kilo)),"unit":"kg"])
        }
      }
      if options["readWorkout"] == true {
        let samples=try await self.samples(type:HKObjectType.workoutType(),start:start,end:end)
        if samples.count > 2500 { truncated=true }
        for case let item as HKWorkout in samples.prefix(2500) {
          output.append(["provider":"healthkit","externalId":item.uuid.uuidString,"source":item.sourceRevision.source.bundleIdentifier,
            "kind":"workout","date":self.iso.string(from:item.startDate),"startAt":self.iso.string(from:item.startDate),"endAt":self.iso.string(from:item.endDate),
            "value":item.duration,"unit":"seconds","title":"Actividad de Apple Health"])
        }
      }
      return ["records":output,"truncated":truncated,"readAccess":"not_disclosed"]
    }
    AsyncFunction("writeWorkout") { (record: [String: Any]) async throws -> [String: Any] in
      guard self.store.authorizationStatus(for:HKObjectType.workoutType()) == .sharingAuthorized else { throw HealthInputError("No autorizaste guardar entrenamientos en Apple Health.") }
      guard let id=record["id"] as? String, !id.isEmpty, id.count <= 200,
        let rawVersion=record["version"] as? NSNumber, rawVersion.doubleValue.isFinite,
        rawVersion.doubleValue > 0, rawVersion.doubleValue.rounded() == rawVersion.doubleValue, rawVersion.doubleValue < 9_007_199_254_740_991,
        let from=record["startAt"] as? String, let to=record["endAt"] as? String else { throw HealthInputError("Sesión inválida.") }
      let version=rawVersion.intValue
      let start=try self.date(from); let end=try self.date(to)
      guard end > start && end.timeIntervalSince(start) < 7*86400 else { throw HealthInputError("Revisá las fechas de la sesión.") }
      let config=HKWorkoutConfiguration(); config.activityType = record["activity"] as? String == "strength" ? .traditionalStrengthTraining : .other; config.locationType = .unknown
      let builder=HKWorkoutBuilder(healthStore:self.store,configuration:config,device:nil)
      try await builder.beginCollection(at:start)
      try await builder.addMetadata([HKMetadataKeySyncIdentifier:"cuki:"+id,HKMetadataKeySyncVersion:version,HKMetadataKeyWasUserEntered:true])
      try await builder.endCollection(at:end)
      guard let workout=try await builder.finishWorkout() else { throw HealthInputError("Apple Health no confirmó el entrenamiento. Podés reintentar.") }
      // Sync identifier + monotonically increasing version prevents duplicate exports.
      // No fabricated energy, heart-rate, route or distance samples are added.
      return ["confirmed":true,"externalId":workout.uuid.uuidString]
    }
    AsyncFunction("openSettings") { () async throws in
      try await MainActor.run {
        guard let url=URL(string:UIApplication.openSettingsURLString) else { throw HealthInputError("No se pudieron abrir los ajustes.") }
        UIApplication.shared.open(url)
      }
    }
  }
  private func samples(type: HKSampleType,start: Date,end: Date) async throws -> [HKSample] {
    try await withCheckedThrowingContinuation { continuation in
      let predicate=HKQuery.predicateForSamples(withStart:start,end:end,options:.strictStartDate)
      let query=HKSampleQuery(sampleType:type,predicate:predicate,limit:2501,
        sortDescriptors:[NSSortDescriptor(key:HKSampleSortIdentifierStartDate,ascending:false)]) { _,samples,error in
        if let error { continuation.resume(throwing:error) }
        else { continuation.resume(returning:samples ?? []) }
      }
      store.execute(query)
    }
  }
}
private struct HealthInputError: LocalizedError {
  let message: String
  init(_ message: String) { self.message=message }
  var errorDescription: String? { message }
}
