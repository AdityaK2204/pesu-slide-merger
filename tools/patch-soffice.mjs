// Adapts @matbee/libreoffice-converter's browser build to run inside an MV3
// extension's offscreen document. Run it on fresh copies of the package files:
//
//   node tools/patch-soffice.mjs lo/soffice.js lo/browser.worker.global.js
//
// 1. CSP (soffice.js): MV3 extension pages forbid building functions from
//    strings. Emscripten's embind generates two kinds of glue with
//    `new Function(...)`: C++ -> JS invokers (craftInvokerFunction) and emval
//    method callers. Both are swapped for closures that do exactly what the
//    generated code does (what Emscripten emits with DYNAMIC_EXECUTION=0).
//    Verified: patched and unpatched builds produce byte-identical PDFs.
// 2. Threads (soffice.js): the build pre-spawns 4 pthread workers and creates
//    more on demand. In an offscreen document, on-demand creation while the
//    converter thread is blocked deadlocks (conversion hangs at "Saving").
//    Pre-spawning 20 avoids on-demand creation.
// 3. Logging (browser.worker.global.js): the worker turns on every LibreOffice
//    debug log (SAL_LOG=+ALL), which floods the console; keep it quiet.
import fs from 'node:fs';
import path from 'node:path';

const POOL_SIZE = 20;

function replaceBetween(src, startMarker, endMarker, replacement, label) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`${label}: start marker not found`);
  if (src.indexOf(startMarker, start + 1) >= 0) throw new Error(`${label}: start marker not unique`);
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${label}: end marker not found`);
  return src.slice(0, start) + replacement + src.slice(end + endMarker.length);
}

const INVOKER = [
  'var retType=argTypes[0],classParam=argTypes[1];',
  'var invokerFn=function(...callArgs){',
  'checkArgCount(callArgs.length,minArgs,expectedArgCount,humanName,throwBindingError);',
  'var destructors=needsDestructorStack?[]:null;var wired=[cppTargetFunc];var thisWired;',
  'if(isClassMethodFunc){thisWired=classParam["toWireType"](destructors,this);wired.push(thisWired)}',
  'var argsWired=new Array(expectedArgCount);',
  'for(var i=0;i<expectedArgCount;++i){argsWired[i]=argTypes[i+2]["toWireType"](destructors,callArgs[i]);wired.push(argsWired[i])}',
  'var rv=cppInvokerFunc(...wired);',
  'if(needsDestructorStack){runDestructors(destructors)}else{',
  'for(var i=isClassMethodFunc?1:2;i<argTypes.length;++i){',
  'if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(i===1?thisWired:argsWired[i-2])}}}',
  'if(returns){return retType["fromWireType"](rv)}};',
].join('');

const METHOD_CALLER = [
  'var invokerFunction=function(obj,func,destructorsRef,args){',
  'var vals=[];var off=0;',
  'for(var i=0;i<argCount;++i){vals.push(types[i].readValueFromPointer(args+off));off+=types[i].argPackAdvance}',
  'var rv=kind===1?new func(...vals):kind===0?func.call(obj,...vals):func.call(...vals);',
  'if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};',
].join('');

function patchSoffice(src) {
  if (src.includes('newFunc(Function')) {
    src = replaceBetween(src,
      'var closureArgs=[humanName,throwBindingError,cppInvokerFunc,cppTargetFunc,runDestructors,',
      'var invokerFn=newFunc(Function,args)(...closureArgs);',
      INVOKER, 'craftInvokerFunction');
    const at = src.indexOf('function __emval_get_method_caller(');
    if (at < 0) throw new Error('__emval_get_method_caller not found');
    src = src.slice(0, at) + replaceBetween(src.slice(at),
      'var functionBody=`return function (obj, func, destructorsRef, args) {',
      'var invokerFunction=newFunc(Function,params)(...args);',
      METHOD_CALLER, '__emval_get_method_caller');
    if (src.includes('newFunc(Function')) throw new Error('a string-built function is still left');
  }
  const pool = /initMainThread\(\)\{var pthreadPoolSize=\d+;/;
  if (!pool.test(src)) throw new Error('pthread pool size not found');
  return src.replace(pool, `initMainThread(){var pthreadPoolSize=${POOL_SIZE};`);
}

function patchWorker(src) {
  if (!src.includes('SAL_LOG="+ALL"')) return src;
  return src.replace('SAL_LOG="+ALL"', 'SAL_LOG="-WARN-INFO"');
}

for (const file of process.argv.slice(2)) {
  const name = path.basename(file);
  const before = fs.readFileSync(file, 'utf8');
  const after = name.startsWith('soffice') ? patchSoffice(before) : name.startsWith('browser.worker') ? patchWorker(before) : null;
  if (after === null) throw new Error(`${file}: don't know how to patch this file`);
  if (after === before) { console.log(`${file}: nothing to change`); continue; }
  fs.writeFileSync(file, after);
  console.log(`${file}: patched`);
}
