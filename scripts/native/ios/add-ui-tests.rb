#!/usr/bin/env ruby
# This target belongs only to the disposable simulator build. No production signing changes.
require 'xcodeproj'
require 'fileutils'
root = File.expand_path('../../..', __dir__)
project_path = File.join(root, 'apps/mobile/ios/CUKITest.xcodeproj')
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'CUKITest' }
abort 'CUKITest native application target missing' unless app
abort 'Test target already exists; use a fresh prebuild' if project.targets.any? { |t| t.name == 'CUKISmokeTests' }
target = project.new_target(:ui_test_bundle, 'CUKISmokeTests', :ios, '16.4')
target.add_dependency(app)
group = project.main_group.new_group('CUKISmokeTests', 'CUKISmokeTests')
directory = File.join(root, 'apps/mobile/ios/CUKISmokeTests')
FileUtils.mkdir_p(directory)
FileUtils.cp(File.join(__dir__, 'CUKISmokeTests.swift'), directory)
target.add_file_references([group.new_file('CUKISmokeTests.swift')])
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = 'CUKISmokeTests'
  config.build_settings['PRODUCT_MODULE_NAME'] = 'CUKISmokeTests'
  config.build_settings['EXECUTABLE_NAME'] = 'CUKISmokeTests'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.cuki.app.test.uitests'
  config.build_settings['TEST_TARGET_NAME'] = app.name
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1'
  config.build_settings['CODE_SIGN_IDENTITY[sdk=iphonesimulator*]'] = '-'
  config.build_settings['CODE_SIGNING_ALLOWED[sdk=iphonesimulator*]'] = 'YES'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, target)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project_path, 'CUKISmoke', true)
puts 'Added real XCTest UI target; simulator ad-hoc signing is enabled.'
