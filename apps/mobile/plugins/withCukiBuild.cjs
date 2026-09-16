const { withGradleProperties } = require('expo/config-plugins');

// The generated Android project is disposable; keep the JVM budget in this plugin.
// APK packaging exceeded the template's heap in native CI, not in the running app.
function budgetProperties(properties, heapMb = 4096) {
  if (!Number.isInteger(heapMb) || heapMb < 2048 || heapMb > 8192) {
    throw new Error('CUKI Gradle heap must be an integer between 2048 and 8192 MiB');
  }
  return [...properties.filter(p => p.type !== 'property' || p.key !== 'org.gradle.jvmargs'),
    { type: 'property', key: 'org.gradle.jvmargs',
      value: `-Xmx${heapMb}m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8` }];
}
module.exports = (config, options = {}) => withGradleProperties(config, c => {
  c.modResults = budgetProperties(c.modResults, options.heapMb ?? 4096);
  return c;
});
module.exports.budgetProperties = budgetProperties;
