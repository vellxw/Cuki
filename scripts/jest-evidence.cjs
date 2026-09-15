const fs=require('node:fs');
const path=require('node:path');
module.exports=class EvidenceReporter {
 onRunComplete(_,result){
  const passed=!result.wasInterrupted&&result.numFailedTestSuites===0&&result.numRuntimeErrorTestSuites===0&&result.numTotalTests>0&&result.numPassedTests===result.numTotalTests&&result.numPendingTests===0&&result.numTodoTests===0;
  const report={sourceCommit:process.env.GITHUB_SHA??null,scope:'React Native component tests with operating-system substitutes, not native end-to-end',tests:result.numTotalTests,passedTests:result.numPassedTests,failedTests:result.numFailedTests,skipped:result.numPendingTests,todo:result.numTodoTests,passed};
  const dir=path.resolve(__dirname,'../artifacts/verification');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'mobile.json'),JSON.stringify(report,null,2)+'\n');
  if(!passed)this.error=new Error('La suite móvil debe ejecutar y aprobar todos sus casos sin omisiones.');
 }
 getLastError(){return this.error;}
};
