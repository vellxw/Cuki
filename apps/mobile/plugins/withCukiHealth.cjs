const { withInfoPlist, withEntitlementsPlist } = require('expo/config-plugins');
module.exports = function withCukiHealth(config) {
  config=withInfoPlist(config, c => {
    c.modResults.NSHealthShareUsageDescription='Importá las medidas y actividades que autorices. Vos elegís qué guardar en CUKI.';
    c.modResults.NSHealthUpdateUsageDescription='Guardá los entrenamientos de CUKI en Apple Health cuando lo confirmes.';
    return c;
  });
  return withEntitlementsPlist(config, c => {
    c.modResults['com.apple.developer.healthkit']=true;
    return c;
  });
};
