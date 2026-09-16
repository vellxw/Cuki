package com.cuki.health

import android.content.Intent
import android.provider.Settings
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.time.Instant
import java.time.Duration
import java.time.ZoneId
import java.util.UUID

class CukiHealthModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private fun client(): HealthConnectClient {
    check(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) { "Health Connect no está disponible en este dispositivo." }
    return HealthConnectClient.getOrCreate(context)
  }
  private fun requested(options: Map<String, Boolean>): Set<String> = buildSet {
    if (options["readWeight"] == true) add(HealthPermission.getReadPermission(WeightRecord::class))
    if (options["readWorkout"] == true) add(HealthPermission.getReadPermission(ExerciseSessionRecord::class))
    if (options["writeWorkout"] == true) add(HealthPermission.getWritePermission(ExerciseSessionRecord::class))
  }
  override fun definition() = ModuleDefinition {
    Name("CukiHealth")
    AsyncFunction("isAvailable") { HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE }
    AsyncFunction("requestPermissions") Coroutine { options: Map<String, Boolean> ->
      val api = client()
      val desired = requested(options)
      require(desired.isNotEmpty()) { "Elegí al menos un tipo de dato." }
      var granted = api.permissionController.getGrantedPermissions()
      if (!granted.containsAll(desired)) {
        val requestId = UUID.randomUUID().toString()
        val completion = CompletableDeferred<Set<String>>()
        HealthPermissionRequests.pending[requestId] = completion
        try {
          withContext(Dispatchers.Main) {
            val activity = appContext.currentActivity ?: throw IllegalStateException("Abrí CUKI para autorizar permisos.")
            activity.startActivity(Intent(activity, CukiHealthPermissionsActivity::class.java)
              .putExtra("requestId", requestId).putStringArrayListExtra("permissions", ArrayList(desired)))
          }
          withTimeout(120_000L) { completion.await() }
          granted = api.permissionController.getGrantedPermissions()
        } finally { HealthPermissionRequests.pending.remove(requestId) }
      }
      fun status(permission: String, enabled: Boolean?) = if (enabled != true) "not_requested" else if (granted.contains(permission)) "granted" else "denied"
      mapOf("requestCompleted" to true,
        "readWeight" to status(HealthPermission.getReadPermission(WeightRecord::class), options["readWeight"]),
        "readWorkout" to status(HealthPermission.getReadPermission(ExerciseSessionRecord::class), options["readWorkout"]),
        "writeWorkout" to status(HealthPermission.getWritePermission(ExerciseSessionRecord::class), options["writeWorkout"]))
    }
    AsyncFunction("readRecords") Coroutine { from: String, to: String, options: Map<String, Boolean> ->
      val start = Instant.parse(from); val end = Instant.parse(to)
      require(end.isAfter(start) && Duration.between(start,end) <= Duration.ofDays(31)) { "Elegí un rango de hasta 31 días." }
      val api = client(); val permissions = api.permissionController.getGrantedPermissions()
      val range = TimeRangeFilter.between(start,end)
      val records = mutableListOf<Map<String, Any>>()
      var truncated = false
      if (options["readWeight"] == true && permissions.contains(HealthPermission.getReadPermission(WeightRecord::class))) {
        var token: String? = null
        do {
          val page = api.readRecords(ReadRecordsRequest(WeightRecord::class, timeRangeFilter=range, pageSize=500, pageToken=token))
          for (record in page.records) records.add(mapOf("externalId" to record.metadata.id,
            "source" to record.metadata.dataOrigin.packageName, "provider" to "health_connect", "kind" to "weight",
            "date" to record.time.toString(), "value" to record.weight.inKilograms, "unit" to "kg",
            "modifiedAt" to record.metadata.lastModifiedTime.toString()))
          token=page.pageToken
        } while (token != null && records.size < 2500)
        if (token != null) truncated=true
      }
      if (options["readWorkout"] == true && permissions.contains(HealthPermission.getReadPermission(ExerciseSessionRecord::class))) {
        var token: String? = null
        do {
          val page = api.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, timeRangeFilter=range, pageSize=500, pageToken=token))
          for (record in page.records) records.add(mapOf("externalId" to record.metadata.id,
            "source" to record.metadata.dataOrigin.packageName, "provider" to "health_connect", "kind" to "workout",
            "date" to record.startTime.toString(), "startAt" to record.startTime.toString(), "endAt" to record.endTime.toString(),
            "value" to Duration.between(record.startTime,record.endTime).seconds.toDouble(), "unit" to "seconds",
            "modifiedAt" to record.metadata.lastModifiedTime.toString(), "title" to (record.title ?: "Actividad")))
          token=page.pageToken
        } while (token != null && records.size < 3000)
        if (token != null) truncated=true
      }
      mapOf("records" to records, "truncated" to truncated, "readAccess" to "explicit")
    }
    AsyncFunction("writeWorkout") Coroutine { record: Map<String, Any> ->
      val api = client()
      check(api.permissionController.getGrantedPermissions().contains(HealthPermission.getWritePermission(ExerciseSessionRecord::class))) { "No autorizaste guardar entrenamientos en Health Connect." }
      val id=record["id"] as? String ?: throw IllegalArgumentException("Falta la identidad de la sesión.")
      val rawVersion=(record["version"] as? Number)?.toDouble() ?: 0.0
      require(rawVersion.isFinite() && rawVersion > 0 && rawVersion < 9_007_199_254_740_991.0 && rawVersion == kotlin.math.floor(rawVersion)) { "Versión de sesión inválida." }
      val version=rawVersion.toLong()
      val start=Instant.parse(record["startAt"] as? String ?: throw IllegalArgumentException("Falta el inicio.")); val end=Instant.parse(record["endAt"] as? String ?: throw IllegalArgumentException("Falta el fin."))
      require(id.length in 1..200 && version > 0 && end.isAfter(start) && Duration.between(start,end) < Duration.ofDays(7)) { "Sesión inválida." }
      val zone=ZoneId.systemDefault()
      val item=ExerciseSessionRecord(startTime=start,startZoneOffset=zone.rules.getOffset(start),endTime=end,endZoneOffset=zone.rules.getOffset(end),
        exerciseType=ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        title=(record["name"] as? String)?.take(200) ?: "Entrenamiento CUKI",
        metadata=Metadata.manualEntry(clientRecordId="cuki:"+id,clientRecordVersion=version))
      val result=api.insertRecords(listOf(item))
      val externalId=result.recordIdsList.firstOrNull()
      check(!externalId.isNullOrEmpty()) { "Health Connect no confirmó el entrenamiento. Podés reintentar." }
      mapOf("confirmed" to true,"externalId" to externalId)
    }
    AsyncFunction("openSettings") {
      val intent=Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) != null) context.startActivity(intent)
      else context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
