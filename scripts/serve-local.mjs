import {createServer} from "node:http";
import {createReadStream,statSync} from "node:fs";
import {extname,join,normalize} from "node:path";

const root=process.cwd();
const port=Number(process.argv[2]||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error("Ungültiger Port.");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg"};

createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  const relative=pathname==="/"?"index.html":pathname.replace(/^\/+/,"");
  const file=normalize(join(root,relative));
  if(!file.startsWith(root)){
    response.writeHead(403).end("Forbidden");
    return;
  }
  try{
    if(!statSync(file).isFile())throw new Error("Not a file");
    response.writeHead(200,{"Content-Type":types[extname(file).toLowerCase()]||"application/octet-stream","Cache-Control":"no-store"});
    createReadStream(file).pipe(response);
  }catch{
    response.writeHead(404).end("Not found");
  }
}).listen(port,"127.0.0.1",()=>console.log(`ZUSTAND Studio: http://localhost:${port}`));
