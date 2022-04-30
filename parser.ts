import { table } from 'console';
import { TreeCursor } from 'lezer';
import {parser} from 'lezer-python';
import { isIfStatement } from 'typescript';
import {Parameter, Stmt, Expr, Type, isOp, VarInit, FunDef, TypedVar} from './ast';
import { isObject, tcExpr, tcProgram } from './tc';

var supportedTypes = ["int","none","bool"];
var cls_name_reg = "none";
export function parseProgram(source : string) : Array<Stmt<any>> {
  const t = parser.parse(source).cursor();
  return traverseStmts(source, t);
}

export function traverseStmts(s : string, t : TreeCursor) : Array<Stmt<any>>{
  // The top node in the program is a Script node with a list of children
  // that are various statements
  t.firstChild();
  const stmts = [];
  do {
    stmts.push(traverseStmt(s, t));
  } while(t.nextSibling()); // t.nextSibling() returns false when it reaches
                            //  the end of the list of children
  t.parent();
  return stmts;
}

/*
  Invariant – t must focus on the same node at the end of the traversal
*/
export function traverseStmt(s : string, t : TreeCursor) : Stmt<any> {
  switch(t.type.name) {
    case "ReturnStatement":
      t.firstChild();  // Focus return keyword
      t.nextSibling(); // Focus expression
      var value : Expr<any>;
      if (s.substring(t.from,t.to)==""){
        value = {tag:"none"};
      } else {
        value= traverseExpr(s, t);
      }
       
      t.parent();
      return { tag: "return", value };
    case "AssignStatement":
      t.firstChild(); // focused on name (the first child)
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // focused on :type part, explained in Chocopy
      var anno =  s.substring(t.from+1, t.to).trim(); // Use +2 to skip the :
      t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
      t.nextSibling(); // focused on the value expression

      var value = traverseExpr(s, t);
      t.parent();
      console.log("Assign-return:",{ a: anno, tag: "assign", name, value } )
      return { a: anno, tag: "assign", name, value };
    case "ExpressionStatement":
      t.firstChild(); // The child is some kind of expression, the
                      // ExpressionStatement is just a wrapper with no information
      var expr = traverseExpr(s, t);
      t.parent();
      return { tag: "expr", expr: expr };
    case "FunctionDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name = s.substring(t.from, t.to);
      t.nextSibling(); // Focus on ParamList
      var params = traverseParameters(s, t)
      t.nextSibling(); // Focus on Body or TypeDef
      let ret : Type = "none";
      let maybeTD = t;
      if(maybeTD.type.name === "TypeDef") {
        t.firstChild();
        ret = traverseType(s, t);
        t.parent();
      }
      t.nextSibling(); // Focus on single statement (for now)
      t.firstChild();  // Focus on :
      const body = [];
      while(t.nextSibling()) {
        body.push(traverseStmt(s, t));
      }
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      return {
        tag: "define",
        name, params, body, ret
      }
    case "ClassDefinition":
      t.firstChild();  // Focus on def
      t.nextSibling(); // Focus on name of function
      var name = s.substring(t.from, t.to);
      supportedTypes.push(name);
      cls_name_reg = name;
      t.nextSibling(); // Focus on object, the original param list
      //no params here, as only "object" is allowed
      t.nextSibling(); // Focus on Body or TypeDef
      t.nextSibling(); // Focus on single statement (for now)
      t.firstChild();  // Focus on :
      let varInits:Array<Stmt<any>> = [];
      let clsBody = new Map();
      while(t.nextSibling()) {
        let cls_stmt = traverseStmt(s, t);
        if (cls_stmt.tag == "define"){
          // { a?: A, tag: "class", name:string, fields: Stmt<A>[], methods: Map <string, FunDef<A>>}
          clsBody.set(cls_stmt.name,{name:cls_stmt.name,params: cls_stmt.params,
                        ret:cls_stmt.ret,inits:varInits,body: cls_stmt.body});
        } else {
          if (cls_stmt.tag == "assign"){
            varInits.push(cls_stmt)
          } else {
            throw new Error("PARSER ERROR: unsupported statements type for class definition")
          }

        }

      }
      t.parent();      // Pop to Body
      t.parent();      // Pop to FunctionDefinition
      console.log("class_name", name);
      cls_name_reg = "none";
      return {
        a: name,
        tag: "class",
        name: name, 
        fields: varInits, 
        methods: clsBody
      }
    case "PassStatement":
      return {tag: "pass"};
    case "IfStatement":
      t.firstChild();
      t.nextSibling();
      const cond_expr = traverseExpr(s,t);
      t.nextSibling();//focus on body
      t.firstChild();//focus on :
      const stmt_b:Array<Stmt<any>> = [];
      const else_stmt_b:Array<Stmt<any>> = [];
      while (t.nextSibling()){
        stmt_b.push(traverseStmt(s,t));
      }
      t.parent();
      t.nextSibling();
      if (t.node.type.name==="else"){
        t.nextSibling();//focus on body
        t.firstChild();//focus on :

        while (t.nextSibling()){
          else_stmt_b.push(traverseStmt(s,t));
        }
        t.parent();
        t.parent();
        return {tag:"if", cond: cond_expr, body: stmt_b,else_body:else_stmt_b};   
      } else {
        t.parent();
        return {tag:"if", cond: cond_expr, body: stmt_b,else_body:else_stmt_b}
      }
    case "WhileStatement":
      t.firstChild();
      t.nextSibling();
      const cond_while = traverseExpr(s,t);
      t.nextSibling();//focus on body
      t.firstChild();//focus on :
      const stmt_w:Array<Stmt<any>> = [];
      while (t.nextSibling()){
        stmt_w.push(traverseStmt(s,t));
      }
      t.parent();
      t.parent();
      return  {tag:"while", cond:cond_while,body:stmt_w}

   
  }
}

export function traverseType(s : string, t : TreeCursor) : Type {
  switch(t.type.name) {
    case "VariableName":
      const name = s.substring(t.from, t.to);
      // // if(name !== "int" && name !=="none" && name !== "bool") {
      // if (!supportedTypes.includes(name)){
      //   throw new Error("Unknown VariableName type: " + name)
      // }
      let return_name = name as Type;
      return return_name;
    default:
      throw new Error("Unknown non-VariableName type: " + t.type.name)

  }
}

export function traverseParameters(s : string, t : TreeCursor) : Parameter[] {
  t.firstChild();  // Focuses on open paren
  const parameters = []
  t.nextSibling(); // Focuses on a VariableName
  while(t.type.name !== ")") {
    let name = s.substring(t.from, t.to);
    t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
    let nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
    if(nextTagName !== "TypeDef") { throw new Error("Missed type annotation for parameter " + name)};
    t.firstChild();  // Enter TypeDef
    t.nextSibling(); // Focuses on type itself
    let typ = traverseType(s, t);
    t.parent();
    t.nextSibling(); // Move on to comma or ")"
    parameters.push({name, typ});
    t.nextSibling(); // Focuses on a VariableName
  }
  t.parent();       // Pop to ParamList
  return parameters;
}

export function traverseExpr(s : string, t : TreeCursor) : Expr<any> {
  switch(t.type.name) {
    case "None":
      return {tag:"none"}
    case "Boolean":
      if(s.substring(t.from, t.to) === "True") { return { tag: "true" }; }
      else { return { tag: "false" }; }
    case "Number":
      return { tag: "number", value: Number(s.substring(t.from, t.to)) };
    case "VariableName":
      return { tag: "id", name: s.substring(t.from, t.to) };
    case "CallExpression":
      t.firstChild(); // Focus name
      var name = s.substring(t.from, t.to);
      if (name.includes('.')){
        var obj_parsed = traverseExpr(s,t);
      }

      var result : Expr<any>
      t.nextSibling(); // Focus ArgList
      t.firstChild(); // Focus open paren
      var args = traverseArguments(t, s);
      t.prevSibling();
      if (name.includes('.')){
        if (obj_parsed.tag == "getfield"){
          result = {tag:"method", obj:obj_parsed.obj,name:obj_parsed.name,args:args}
        }
      } else {
        result = { tag: "call", name, args: args};
      }
      t.parent();
      return result;
    case "UnaryExpression":
      t.firstChild();
      const uop = s.substring(t.from, t.to);
      switch (uop) {
        case '-':
          t.nextSibling();
          var this_var = traverseExpr(s,t)
          if (this_var.tag == "id" ){
            t.parent();
            return {tag:'binop',op:'*',lhs:{a:"int",tag:"number",value:-1},rhs:this_var}
          } 

          var num = Number(uop + s.substring(t.from, t.to));
          if (isNaN(num)){
            throw new Error("PARSE ERROR: unary operation failed")
          }
          t.parent();
          return { tag: "number", value: num }
        case '+':
          t.nextSibling();
          var this_var = traverseExpr(s,t)
          if (this_var.tag == "id" ){
            t.parent();
            return {tag:'binop',op:'*',lhs:{a:"int",tag:"number",value:1},rhs:this_var}
          } 
          var num = Number(uop + s.substring(t.from, t.to));
          if (isNaN(num)){
            throw new Error("PARSE ERROR: unary operation failed")
          }
          t.parent();
          return { tag: "number", value: num }
        case "not":
          var not_result:Expr<any>;
          t.nextSibling();
          if(s.substring(t.from, t.to) === "True") {
            not_result = {tag: "false"}
          } else{
            not_result = {tag: "true"}
          }
          t.parent();
          return not_result;

        case "default":
          throw new Error("PARSE ERROR: unimplemented unary op");
      }

    case "BinaryExpression":
      t.firstChild(); // go to lhs
      const lhsExpr = traverseExpr(s, t);
      t.nextSibling(); // go to op
      var opStr = s.substring(t.from, t.to);
      if(!isOp(opStr)) {
        throw new Error(`Unknown or unhandled op: ${opStr}`);
      }
      t.nextSibling(); // go to rhs
      const rhsExpr = traverseExpr(s, t);
      t.parent();
      return {
        tag: "binop",
        op: opStr,
        lhs: lhsExpr,
        rhs: rhsExpr
      };
    case "ParenthesizedExpression":
      t.firstChild(); // focus on (
      t.nextSibling();
      const paren_exp = traverseExpr(s,t)
      t.nextSibling(); // focus on )
      t.parent();
      return paren_exp
    case "MemberExpression":
        t.firstChild(); //focus on variable name like "c","self"
        var cls_name = s.substring(t.from,t.to);
        var cls_obj = traverseExpr(s,t)
        t.nextSibling();
        t.nextSibling(); // focus on property name
        const property_name = s.substring(t.from,t.to);
        var result:Expr<any>; 
        // Try to parse self with a register
        if (cls_name == "self"){
          if (cls_name_reg=="none"){
            throw new Error("Illegal self here");
          } else {
            cls_name = cls_name_reg;
          }         
        }
        t.parent();
        console.log(`Member Expression, obj:${cls_obj}, name:${property_name}`)
        result = { tag: "getfield", obj: cls_obj,name: property_name}


        return result;
    case "self":
      return {tag:"self",a:{tag:"object",class:cls_name_reg}};
    default:
      throw new Error(`Expression not included in traverseExpr: ${t.type.name}, ${s.substring(t.from, t.to)}`)
  
  }
}

export function traverseArguments(c : TreeCursor, s : string) : Expr<any>[] {
  c.firstChild();  // Focuses on open paren
  const args = [];
  c.nextSibling();
  while(c.type.name !== ")") {
    let expr = traverseExpr(s, c);
    args.push(expr);
    c.nextSibling(); // Focuses on either "," or ")"
    c.nextSibling(); // Focuses on a VariableName
  } 
  c.parent();       // Pop to ArgList
  return args;
}
export function traverse(c : TreeCursor, s : string) : Array<Stmt<any>> {
  switch(c.node.type.name) {
    case "Script":
      const stmts = [];
      c.firstChild();
      do {
        stmts.push(traverseStmt(s,c));
      } while(c.nextSibling())
      console.log("traversed " + stmts.length + " statements ", stmts, "stopped at " , c.node);
      return stmts;
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source : string) : Array<Stmt<any>> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}