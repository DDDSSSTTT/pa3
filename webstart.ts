import {compile, runwatsrc} from './compiler';


document.addEventListener("DOMContentLoaded", async () => {
  function display(arg : string) {
    const elt = document.createElement("pre");
    document.getElementById("output").appendChild(elt);
    elt.innerText = arg;
  }
  var memory = new WebAssembly.Memory({initial:10, maximum:100});
  var importObject = {
    imports: {
      mem:memory,
      print_num: (arg : any) => {
        console.log("Logging from WASM: ", arg);
        display(String(arg));
        return arg;
      },
      print_bool: (arg : any) => {
        if(arg === 0) { display("False"); }
        else { display("True"); }
        return arg;
      },
      print_none: (arg: any) => {
        display("None");
        return arg;
      }
    },
  };
  const runButton = document.getElementById("run");
  const userCode = document.getElementById("user-code") as HTMLTextAreaElement;
  runButton.addEventListener("click", async () => {
    const program = userCode.value;
    const output = document.getElementById("output");
    output.innerHTML='';
    display("Program Output:")
    try {
      const wat = compile(program);
      const code = document.getElementById("generated-code");
      code.textContent = 'Code Generated:' + wat;
      const result = await runwatsrc(wat, importObject);
      //output.textContent += (String(result));
      // display(String(result));
      output.setAttribute("style", "color: black");
    }
    catch(e) {
      console.error(e)
      output.textContent = String(e);
      output.setAttribute("style", "color: red");
    }
  });

  userCode.value = localStorage.getItem("program");
  userCode.addEventListener("keypress", async() => {
    localStorage.setItem("program", userCode.value);
  });
});