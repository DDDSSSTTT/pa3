"use strict";
exports.__esModule = true;
var parse_python_js_1 = require("./parse-python.js");
var line = "def funfunFib(x:int)->int:\n    if x <= 1:\n        return 1\n    else:\n        return funfunFib(x-1) + funfunFib(x-2)";
(0, parse_python_js_1.print_trees)(line);
// var ast = parse(line);
// console.log(JSON.stringify(ast,null,2));
