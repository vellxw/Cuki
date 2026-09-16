#!/usr/bin/env ruby
# This target belongs only to the disposable simulator build. No production signing changes.
require 'xcodeproj'
require 'fileutils'
root = File.expand_path('../../..', __dir__)
visual = ARGV.include?('--visual')
app_name = visual ? 'CUKIVisual' : 'CUKITest'
test_name = visual ? 'CUKIVisualTests' : 'CUKISmokeTests'
scheme_name = visual ? 'CUKIVisualCapture' : 'CUKISmoke'
project_path = File.join(root, "apps/mobile/ios/#{app_name}.xcodeproj")
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == app_name }
abort "#{app_name} native application target missing" unless app
abort 'Test target already exists; use a fresh prebuild' if project.targets.any? { |t| t.name == test_name }
target = project.new_target(:ui_test_bundle, test_name, :ios, '16.4')
target.add_dependency(app)
group = project.main_group.new_group(test_name, test_name)
directory = File.join(root, 'apps/mobile/ios', test_name)
FileUtils.mkdir_p(directory)
FileUtils.cp(File.join(__dir__, test_name + '.swift'), directory)
target.add_file_references([group.new_file(test_name + '.swift')])
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = test_name
  config.build_settings['PRODUCT_MODULE_NAME'] = test_name
  config.build_settings['EXECUTABLE_NAME'] = test_name
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = visual ? 'com.cuki.app.visual.uitests' : 'com.cuki.app.test.uitests'
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
scheme.save_as(project_path, scheme_name, true)
puts 'Added real XCTest UI target; simulator ad-hoc signing is enabled.'
