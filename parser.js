"use strict";
exports.__esModule = true;
exports.parse = exports.traverse = exports.traverseArguments = exports.traverseExpr = exports.traverseParameters = exports.traverseType = exports.traverseStmt = exports.traverseStmts = exports.parseProgram = void 0;
var lezer_python_1 = require("lezer-python");
var ast_1 = require("./ast");
function parseProgram(source) {
    var t = lezer_python_1.parser.parse(source).cursor();
    return traverseStmts(source, t);
}
exports.parseProgram = parseProgram;
function traverseStmts(s, t) {
    // The top node in the program is a Script node with a list of children
    // that are various statements
    t.firstChild();
    var stmts = [];
    do {
        stmts.push(traverseStmt(s, t));
    } while (t.nextSibling()); // t.nextSibling() returns false when it reaches
    //  the end of the list of children
    t.parent();
    return stmts;
}
exports.traverseStmts = traverseStmts;
/*
  Invariant – t must focus on the same node at the end of the traversal
*/
function traverseStmt(s, t) {
    switch (t.type.name) {
        case "ReturnStatement":
            t.firstChild(); // Focus return keyword
            t.nextSibling(); // Focus expression
            var value = traverseExpr(s, t);
            t.parent();
            return { tag: "return", value: value };
        case "AssignStatement":
            t.firstChild(); // focused on name (the first child)
            var name = s.substring(t.from, t.to);
            t.nextSibling(); // focused on :type part, explained in Chocopy
            var anno = s.substring(t.from + 1, t.to).trim(); // Use +2 to skip the :
            t.nextSibling(); // focused on = sign. May need this for complex tasks, like +=!
            t.nextSibling(); // focused on the value expression
            var value = traverseExpr(s, t);
            t.parent();
            return { a: anno, tag: "assign", name: name, value: value };
        case "ExpressionStatement":
            t.firstChild(); // The child is some kind of expression, the
            // ExpressionStatement is just a wrapper with no information
            var expr = traverseExpr(s, t);
            t.parent();
            return { tag: "expr", expr: expr };
        case "FunctionDefinition":
            t.firstChild(); // Focus on def
            t.nextSibling(); // Focus on name of function
            var name = s.substring(t.from, t.to);
            t.nextSibling(); // Focus on ParamList
            var params = traverseParameters(s, t);
            t.nextSibling(); // Focus on Body or TypeDef
            var ret = "none";
            var maybeTD = t;
            if (maybeTD.type.name === "TypeDef") {
                t.firstChild();
                ret = traverseType(s, t);
                t.parent();
            }
            t.nextSibling(); // Focus on single statement (for now)
            t.firstChild(); // Focus on :
            var body = [];
            while (t.nextSibling()) {
                body.push(traverseStmt(s, t));
            }
            t.parent(); // Pop to Body
            t.parent(); // Pop to FunctionDefinition
            return {
                tag: "define",
                name: name,
                params: params,
                body: body,
                ret: ret
            };
        case "PassStatement":
            return { tag: "pass" };
        case "IfStatement":
            t.firstChild();
            t.nextSibling();
            var cond_expr = traverseExpr(s, t);
            t.nextSibling(); //focus on body
            t.firstChild(); //focus on :
            var stmt_b = [];
            var else_stmt_b = [];
            while (t.nextSibling()) {
                stmt_b.push(traverseStmt(s, t));
            }
            t.parent();
            t.nextSibling();
            if (t.node.type.name === "else") {
                t.nextSibling(); //focus on body
                t.firstChild(); //focus on :
                while (t.nextSibling()) {
                    else_stmt_b.push(traverseStmt(s, t));
                }
                t.parent();
                t.parent();
                return { tag: "if", cond: cond_expr, body: stmt_b, else_body: else_stmt_b };
            }
            else {
                t.parent();
                return { tag: "if", cond: cond_expr, body: stmt_b, else_body: else_stmt_b };
            }
        case "WhileStatement":
            t.firstChild();
            t.nextSibling();
            var cond_while = traverseExpr(s, t);
            t.nextSibling(); //focus on body
            t.firstChild(); //focus on :
            var stmt_w = [];
            while (t.nextSibling()) {
                stmt_w.push(traverseStmt(s, t));
            }
            t.parent();
            t.parent();
            return { tag: "while", cond: cond_while, body: stmt_w };
    }
}
exports.traverseStmt = traverseStmt;
function traverseType(s, t) {
    switch (t.type.name) {
        case "VariableName":
            var name_1 = s.substring(t.from, t.to);
            if (name_1 !== "int") {
                throw new Error("Unknown type: " + name_1);
            }
            return name_1;
        default:
            throw new Error("Unknown type: " + t.type.name);
    }
}
exports.traverseType = traverseType;
function traverseParameters(s, t) {
    t.firstChild(); // Focuses on open paren
    var parameters = [];
    t.nextSibling(); // Focuses on a VariableName
    while (t.type.name !== ")") {
        var name_2 = s.substring(t.from, t.to);
        t.nextSibling(); // Focuses on "TypeDef", hopefully, or "," if mistake
        var nextTagName = t.type.name; // NOTE(joe): a bit of a hack so the next line doesn't if-split
        if (nextTagName !== "TypeDef") {
            throw new Error("Missed type annotation for parameter " + name_2);
        }
        ;
        t.firstChild(); // Enter TypeDef
        t.nextSibling(); // Focuses on type itself
        var typ = traverseType(s, t);
        t.parent();
        t.nextSibling(); // Move on to comma or ")"
        parameters.push({ name: name_2, typ: typ });
        t.nextSibling(); // Focuses on a VariableName
    }
    t.parent(); // Pop to ParamList
    return parameters;
}
exports.traverseParameters = traverseParameters;
function traverseExpr(s, t) {
    switch (t.type.name) {
        case "None":
            return { tag: "none" };
        case "Boolean":
            if (s.substring(t.from, t.to) === "True") {
                return { tag: "true" };
            }
            else {
                return { tag: "false" };
            }
        case "Number":
            return { tag: "number", value: Number(s.substring(t.from, t.to)) };
        case "VariableName":
            return { tag: "id", name: s.substring(t.from, t.to) };
        case "CallExpression":
            t.firstChild(); // Focus name
            var name = s.substring(t.from, t.to);
            t.nextSibling(); // Focus ArgList
            t.firstChild(); // Focus open paren
            var args = traverseArguments(t, s);
            var result = { tag: "call", name: name, args: args };
            t.parent();
            return result;
        case "UnaryExpression":
            t.firstChild();
            var uop = s.substring(t.from, t.to);
            switch (uop) {
                case '-':
                    t.nextSibling();
                    var num = Number(uop + s.substring(t.from, t.to));
                    if (isNaN(num)) {
                        throw new Error("PARSE ERROR: unary operation failed");
                    }
                    t.parent();
                    return { tag: "number", value: num };
                case '+':
                    t.nextSibling();
                    var num = Number(uop + s.substring(t.from, t.to));
                    if (isNaN(num)) {
                        throw new Error("PARSE ERROR: unary operation failed");
                    }
                    t.parent();
                    return { tag: "number", value: num };
                case "not":
                    var not_result;
                    t.nextSibling();
                    if (s.substring(t.from, t.to) === "True") {
                        not_result = { tag: "false" };
                    }
                    else {
                        not_result = { tag: "true" };
                    }
                    t.parent();
                    return not_result;
                case "default":
                    throw new Error("PARSE ERROR: unimplemented unary op");
            }
        case "BinaryExpression":
            t.firstChild(); // go to lhs
            var lhsExpr = traverseExpr(s, t);
            t.nextSibling(); // go to op
            var opStr = s.substring(t.from, t.to);
            if (!(0, ast_1.isOp)(opStr)) {
                throw new Error("Unknown or unhandled op: ".concat(opStr));
            }
            t.nextSibling(); // go to rhs
            var rhsExpr = traverseExpr(s, t);
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
            var paren_exp = traverseExpr(s, t);
            t.nextSibling(); // focus on )
            t.parent();
            return paren_exp;
        default:
            throw new Error("Expression not included in traverseExpr: ".concat(t.type.name));
    }
}
exports.traverseExpr = traverseExpr;
function traverseArguments(c, s) {
    c.firstChild(); // Focuses on open paren
    var args = [];
    c.nextSibling();
    while (c.type.name !== ")") {
        var expr = traverseExpr(s, c);
        args.push(expr);
        c.nextSibling(); // Focuses on either "," or ")"
        c.nextSibling(); // Focuses on a VariableName
    }
    c.parent(); // Pop to ArgList
    return args;
}
exports.traverseArguments = traverseArguments;
function traverse(c, s) {
    switch (c.node.type.name) {
        case "Script":
            var stmts = [];
            c.firstChild();
            do {
                stmts.push(traverseStmt(s, c));
            } while (c.nextSibling());
            console.log("traversed " + stmts.length + " statements ", stmts, "stopped at ", c.node);
            return stmts;
        default:
            throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
    }
}
exports.traverse = traverse;
function parse(source) {
    var t = lezer_python_1.parser.parse(source);
    return traverse(t.cursor(), source);
}
exports.parse = parse;
