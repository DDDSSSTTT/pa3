import { none } from 'binaryen';
import { isForStatement } from 'typescript';
import wabt from 'wabt';
import {FunDef,Stmt, Expr, Type, Op} from './ast';
import {parseProgram} from './parser';
import { isObject, tcExpr, tcProgram } from './tc';
var loop_counter: number = 0;
type Env = Map<string, boolean>;
var obj_field_type_idx : Map<string, Map<string, [Type,number]>>;
var classes  = new Map<string, Stmt<Type>>();
var obj_name_reg = "none"
var decl_of_funcs:string[] = [];
function variableNames(stmts: Stmt<Type>[],class_name: string = "") : string[] {
  const vars : Array<string> = [];
  stmts.forEach((stmt) => {
    if(stmt.tag === "assign" && !(vars.includes(stmt.name))) { 
      if (class_name!=""){
        vars.push(`${class_name}.${stmt.name}`)
      } else {
        vars.push(stmt.name);
      }
       }
  });
  return vars;
}
function funs(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag === "define");
}
function nonFuns(stmts: Stmt<Type>[]) : Stmt<Type>[] {
  return stmts.filter(stmt => stmt.tag !== "define");
}
function varsFunsStmts(stmts: Stmt<Type>[]) : [string[], Stmt<Type>[], Stmt<Type>[]] {
  return [variableNames(stmts), funs(stmts), nonFuns(stmts)];
}

export async function runwatsrc(watSource : string, config: any) : Promise<number> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}

export function opStmts(op : Op) {
  switch(op) {
    case "+": return [`i32.add`];
    case "-": return [`i32.sub`];
    case "*": return [`i32.mul`];
    case "//": return [`i32.div_s`];
    case "%": return [`i32.rem_s`];

    case ">": return [`i32.gt_s`];
    case "<": return [`i32.lt_s`];
    case ">=": return [`i32.ge_s`];
    case "<=": return [`i32.le_s`];
    case "==": return [`i32.eq`];
    case "!=": return [`i32.ne`];

    case "and": return [`i32.and`];
    case "or": return [`i32.or`];
    default:
      throw new Error(`[Compiler.ts]Unhandled or unknown op: ${op}`);
  }
}

export function codeGenExpr(expr : Expr<Type>, locals : Env) : Array<string> {
  const emptyEnv = new Map<string, boolean>();
  switch(expr.tag) {
    case "number": return [`(i32.const ${expr.value})`];
    case "true": return [`(i32.const 1)`];
    case "false": return [`(i32.const 0)`];
    case "none": return [`(i32.const 0)`];
    case "id":
      // Since we type-checked for making sure all variable exist, here we
      // just check if it's a local variable and assume it is global if not
      if(locals.has(expr.name)) { return [`(local.get $${expr.name})`]; }
      else { return [`(global.get $${expr.name})`]; }
    case "binop": {
      const lhsExprs = codeGenExpr(expr.lhs, locals);
      const rhsExprs = codeGenExpr(expr.rhs, locals);
      if (expr.op == 'is'){
        console.log("compiler lhs/rhs: ", expr.lhs, expr.rhs);
        console.log(expr.lhs.a == expr.rhs.a, expr.lhs.a===expr.rhs.a);
        if (expr.lhs.a === expr.rhs.a){
          // Same like return true
          return [`(i32.const 1)`]
        } else {
          return [`(i32.const 0)`]
        }
      }
      const opstmts = opStmts(expr.op);
      return [...lhsExprs, ...rhsExprs, ...opstmts];
    }
    case "call":
      console.log("classes:",classes);
      if (classes.has(expr.name)){
        // Instantiate a new obj of class 'expr.name'
        var initvals:string[] = [];
        const classdata = classes.get(expr.name);
        if (classdata.tag!= "class"){
          throw new Error ("Classdata has an non-class tag");
        } else {
          // First we compile its field
          classdata.fields.forEach((f,index)=>{
            const offset = index * 4;
            if (f.tag!="assign"){
              throw new Error(`field ${f} does not have an 'assign' tag`);
            }else{
              var valToBe = codeGenExpr(f.value,locals);
              if (valToBe.length>1){
                throw new Error(`The compiled fields is not a literal`);
              }
              if (obj_field_type_idx.get(expr.name)===undefined){
                console.log(`detect undefind for OFI: ${expr.name}`);
                
                obj_field_type_idx.set(expr.name,new Map<string, [Type,number]>());
                obj_field_type_idx.set(obj_name_reg,new Map<string, [Type,number]>());
              }
              console.log(`adding this entry:${f.name},${index}`);
              obj_field_type_idx.get(expr.name).set(f.name,[f.a,index]);
              obj_field_type_idx.get(obj_name_reg).set(f.name,[f.a,index]);
            }

            initvals = [
              ...initvals,
              `(global.get $heap)`,
              `(i32.add (i32.const ${offset}))`,
              valToBe[0],
              `i32.store`];
          });

          console.log("ONR:", obj_name_reg);
          if (obj_name_reg=="none"){
            throw new Error("Creating methods out of an object declaration");
          }else{
            classdata.methods.forEach((func,f_name)=>{
              const new_name = `${f_name}$${obj_name_reg}`;
              const func_string = codeGenFunDef({...func,name:new_name});
              decl_of_funcs = [decl_of_funcs.join() + func_string.join()]
              console.log("DOF:",decl_of_funcs)
            })
          }
          
          decl_of_funcs = decl_of_funcs.flat();
          console.log("DOF after flat:",decl_of_funcs)

          return [
            ...initvals,
            `(global.get $heap)`,
            `(global.set $heap (i32.add (global.get $heap) (i32.const ${classdata.fields.length*4})))`
          ];
        }
      }
      const valStmts = expr.args.map(e => codeGenExpr(e, locals)).flat();
      let toCall = expr.name;
      if(expr.name === "print") {
        console.log ("parse print, a = "+expr.args[0])
        switch(expr.args[0].a) {
          case "bool": toCall = "print_bool"; break;
          case "int": toCall = "print_num"; break;
          case "none": toCall = "print_none"; break;
          default:throw new Error(`PRINT ERROR: annotation = ${expr.args[0].a}`); break;
        }
      }
      valStmts.push(`(call $${toCall})`);
      console.log(valStmts);
      return valStmts;
    case "method":
      if (expr.tag=="method"){
        //Tricky here, use empty env to init
        const argInstrs = expr.args.map( a => codeGenExpr(a,emptyEnv)).flat();
        var anno_obj = expr.obj.a;
        enum method_support_type {
          "id",
          "method",
          "getfield",
          "call"
        }
        if(anno_obj!="int" && anno_obj != "none" && anno_obj !="bool"){
          const eobj =expr.obj;
          if (eobj.tag=="id" || eobj.tag == "method" || eobj.tag == "getfield" || eobj.tag == "call"){
            var method_stmts = [ ...argInstrs, `call $${expr.name}$${eobj.name}`]

          } else{
            throw new Error("Here obj tag must be id")
          }

        }

      }
  
      return method_stmts;
    case "getfield":
      const anno = expr.obj.a;
      if (anno!="int" && anno!="none" && anno!="bool"){
        const objexprs = codeGenExpr(expr.obj,locals);
        // if (expr.obj.tag=="self"){
        //   //donothing
        // }else{

        // }
        if (expr.obj.tag!='id'){
          if(expr.obj.tag=='self'){
            expr.a = obj_field_type_idx.get(obj_name_reg).get(expr.name)[0]
            expr.obj = {tag:'id',name:obj_name_reg,a:expr.obj.a};


          }else{
            throw new Error(`obj tag is not 'id' or 'self', instead it's ${expr.obj.tag}`)
          }

        } 
        const objdata = obj_field_type_idx.get(expr.obj.name);
        if (objdata===undefined){
          throw new Error(`RUNTIME ERROR: objdata of ${expr.obj.name} is undefined`);
        }
        console.log(`getfield ${expr.name} of ${expr.obj.name}, objdata`);
        const iof = objdata.get(expr.name)[1];
        return [`(global.get $${expr.obj.name})`,`(i32.add (i32.const ${iof*4}))`,`(i32.load)`]
      } else{
        throw new Error(`obj get an annotation of ${anno}`)
      }
  }
}
export function codeGenFunDef(m:FunDef<any>){
    const emptyEnv = new Map<string, boolean>();
    const withParamsAndVariables = new Map<string, boolean>(emptyEnv.entries());

      // Construct the environment for the function body
      const variables = variableNames(m.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      m.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = m.params.map(p => {
        //Ignore self
        if (p.name != "self"){
          return `(param $${p.name} i32)`;
        }
        }).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");
      // Very Tricky here, we ignore the global variable
      const stmts = m.body.map(s => codeGenStmt(s, withParamsAndVariables,emptyEnv)).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${m.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
}
export function codeGenClass(c:Stmt<Type>) : string[]{
  // Currently do not want add any globals when generating class
  var methods : string[]=[];
  if (c.tag!="class"){
    throw new Error("CGC ERROR: Statement tag is not 'class', should not call CGC")
  }else {
    c.methods.forEach((m,i) => {
      var this_fun =  codeGenFunDef({...m, name:`$${m.name}$${c.name}`});
      methods.concat(this_fun)
    })
    methods = methods.flat();
  }
  return methods

}
export function codeGenStmt(stmt : Stmt<Type>, locals : Env, global_vars : Env) : Array<string> {
  const withParamsAndVariables = new Map<string, boolean>(locals.entries());
  const emptyEnv = new Map<string, boolean>();
  switch(stmt.tag) {
    case "class":
      // push class_name to classes
      classes.set(stmt.name,stmt);
      // set class name reg to enable self-parsing
      // cls_name_reg = stmt.name;
      // // construct class variables
      // const cls_vars = variableNames(stmt.fields,stmt.name);
      // cls_vars.forEach(v => withParamsAndVariables.set(v, true));
      // //Construct methods for each class
      // const varDeclCls = cls_vars.map(cv => `local $${cv} i32`).join("\n");
      // // NOTE: very tricky here, we just don't pass global env to code gen when gen class methods
      // // NOTE: 0426, even more tricky, have to convert map into a list
      // const funcCls = codeGenClass(stmt)
      // const funcClsBody = funcCls.join("\n");
      // //Reset class name reg
      // cls_name_reg = "none";
      return;
    case "define":
      // Construct the environment for the function body
      const variables = variableNames(stmt.body);
      variables.forEach(v => withParamsAndVariables.set(v, true));
      stmt.params.forEach(p => withParamsAndVariables.set(p.name, true));

      // Construct the code for params and variable declarations in the body
      const params = stmt.params.map(p => `(param $${p.name} i32)`).join(" ");
      const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

      const stmts = stmt.body.map(s => codeGenStmt(s, withParamsAndVariables,global_vars)).flat();
      const stmtsBody = stmts.join("\n");
      return [`(func $${stmt.name} ${params} (result i32)
        (local $scratch i32)
        ${varDecls}
        ${stmtsBody}
        (i32.const 0))`];
    case "return":
      var valStmts = codeGenExpr(stmt.value, locals);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var ofi = obj_field_type_idx;
      if(stmt.value.tag == 'call' && classes.has(stmt.value.name)){
        // We are creating an object
        console.log(`Creating object ${stmt.name} from ${stmt.value.name}`);
        obj_name_reg = stmt.name;
        var svn = stmt.value.name;
        ofi.set(stmt.name, ofi.get(svn));
        ofi.delete(svn);
      } else {
        if (stmt.value.hasOwnProperty('a') && isObject(stmt.value.a)){
          // shallow copy object to object
          if (stmt.value.tag == 'id' &&ofi.has(stmt.value.name)){
            var svn = stmt.value.name;
            ofi.set(stmt.name, ofi.get(svn));
  
          } else{
            throw new Error(`try to copy object,but ${stmt.value} is NOT an object`);
          }
  
        }
      }

      var valStmts = codeGenExpr(stmt.value, locals);
      if (stmt.name.includes(".")){
        // Deal with Setfield
        var obj_name = stmt.name.split('.',2)[0]
        if (obj_name=='self'){obj_name = obj_name_reg;}
        const fld_name = stmt.name.split('.',2)[1]
        const iof = obj_field_type_idx.get(obj_name).get(fld_name)[1]
        const lst_of_stmts = [
          `(global.get $${obj_name})`,
          `(i32.add (i32.const ${iof*4}))`,
          ...valStmts,
          `i32.store`
        ]
        valStmts = lst_of_stmts;

      } else {
        if(locals.has(stmt.name)) { 
          valStmts.push(`(local.set $${stmt.name})`); }
        else { 
          // Dealing with globals
          valStmts.push(`(global.set $${stmt.name})`); 
        }
      }

      obj_name_reg = "none";
      return valStmts;
    case "expr":
      const result = codeGenExpr(stmt.expr, locals);
      result.push("(local.set $scratch)");
      return result;
    case "pass":
        const donothing : string[] =[]
        return donothing;
    case "if":
    //  { a?: A, tag: "if", cond: Expr<A>, body: Stmt<A>[], else_body: Stmt<A>[]}
      var condExpr = codeGenExpr(stmt.cond,locals); //generate condition
      let out = condExpr.concat([`(if`]).concat([`(then`]);
      var body_stmts = stmt.body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));//generate then body
      out = out.concat(body_stmts).concat([`)`]);
      if (stmt.else_body.length>0){
        out = out.concat(`(else`)
        var else_stmts =  stmt.else_body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));//generate the else body
        out = out.concat(else_stmts).concat(`)`)
      } 
      //end the if statement
      out = out.concat([`)`]);
      return out;
    case "while":
    // { a?: A, tag: "while",cond: Expr <A>, body: Stmt<A>[]}
      var condwhile = codeGenExpr(stmt.cond,locals);
      let whileout = condwhile.concat([`(if`]).concat([`(then`]);
      // Need to check the cond before enter this loop
      whileout = whileout.concat([`(loop $myLoop${loop_counter}`]);
      var body_stmts = stmt.body.map(s=>(codeGenStmt(s,locals,global_vars)).flat().join("\n"));
      whileout = whileout.concat(body_stmts)
      whileout = whileout.concat(condwhile).concat([`br_if $myLoop${loop_counter}`]);
      //Endloop
      whileout = whileout.concat([`)`]);
      //Endwhile(
      whileout = whileout.concat([`)`]).concat([`)`])
      loop_counter += 1;
      return whileout
  }
}
export function compile(source : string) : string {

  let ast = parseProgram(source);
  obj_field_type_idx = new Map<string, Map<string, [Type,number]>>();
  console.log("parsed program, ast:", ast)
  ast = tcProgram(ast);
  console.log("after tc, ast:", ast)
  decl_of_funcs = [];
  const emptyEnv = new Map<string, boolean>();
  const [vars, funs, stmts] = varsFunsStmts(ast);
  const funsCode : string[] = funs.map(f => codeGenStmt(f, emptyEnv, emptyEnv)).map(f => f.join("\n"));
  const allFuns = funsCode.join("\n\n");
  const varDecls = vars.map(v => `(global $${v} (mut i32) (i32.const 0))`).join("\n");
  console.log("compile-stmts:",stmts)
  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv, emptyEnv)).flat();

  const main = [`(local $scratch i32)`, ...allStmts].join("\n");

  const lastStmt = ast[ast.length - 1];
  const isExpr = lastStmt.tag === "expr";
  var retType = "";
  var retVal = "";
  if(isExpr) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return `
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      (memory (import "imports" "mem") 1)
      (global $heap (mut i32) (i32.const 4))
      ${varDecls}
      ${decl_of_funcs}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
