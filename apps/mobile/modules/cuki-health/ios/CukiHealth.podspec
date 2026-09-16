Pod::Spec.new do |s|
  s.name = 'CukiHealth'
  s.version = '0.1.0'
  s.summary = 'CUKI optional on-device health integration'
  s.description = 'Explicit reading of weights and activities, and versioned workout export.'
  s.license = { :type => 'Proprietary' }
  s.author = 'CUKI'
  s.homepage = 'https://github.com/vellxw/Cuki'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/vellxw/Cuki.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_VERSION' => '5.0' }
end
