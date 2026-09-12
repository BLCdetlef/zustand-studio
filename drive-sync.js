(function(root){
  "use strict";

  const FORMAT="zustand-studio-encrypted-v1";
  const ITERATIONS=310000;
  const enc=new TextEncoder();
  const dec=new TextDecoder();

  function bytesToBase64(bytes){
    let binary="";
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary);
  }

  function base64ToBytes(value){
    const binary=atob(String(value||""));
    return Uint8Array.from(binary,char=>char.charCodeAt(0));
  }

  async function deriveKey(passphrase,salt,iterations=ITERATIONS){
    if(String(passphrase||"").length<12)throw new Error("Das Studio-Passwort muss mindestens 12 Zeichen lang sein.");
    const material=await crypto.subtle.importKey("raw",enc.encode(passphrase),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey(
      {name:"PBKDF2",hash:"SHA-256",salt,iterations},material,
      {name:"AES-GCM",length:256},false,["encrypt","decrypt"]
    );
  }

  async function encryptJson(value,passphrase){
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await deriveKey(passphrase,salt);
    const plaintext=enc.encode(JSON.stringify(value));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plaintext));
    return {
      format:FORMAT,createdAt:new Date().toISOString(),
      kdf:{name:"PBKDF2",hash:"SHA-256",iterations:ITERATIONS,salt:bytesToBase64(salt)},
      cipher:{name:"AES-GCM",iv:bytesToBase64(iv)},
      ciphertext:bytesToBase64(ciphertext)
    };
  }

  async function decryptJson(envelope,passphrase){
    if(!envelope||envelope.format!==FORMAT)throw new Error("Unbekanntes Format der verschlüsselten Studio-Datei.");
    const iterations=Number(envelope.kdf?.iterations);
    if(!Number.isInteger(iterations)||iterations<100000||iterations>2000000)throw new Error("Ungültige Schlüsselableitung.");
    try{
      const key=await deriveKey(passphrase,base64ToBytes(envelope.kdf.salt),iterations);
      const plaintext=await crypto.subtle.decrypt(
        {name:"AES-GCM",iv:base64ToBytes(envelope.cipher?.iv)},key,base64ToBytes(envelope.ciphertext)
      );
      return JSON.parse(dec.decode(plaintext));
    }catch(error){
      if(error instanceof SyntaxError)throw new Error("Die entschlüsselten Studio-Daten sind ungültig.");
      throw new Error("Entschlüsselung fehlgeschlagen. Bitte Studio-Passwort prüfen.");
    }
  }

  class DriveSyncClient{
    constructor({clientId,fileName="zustand-studio.enc.json"}){
      this.clientId=String(clientId||"").trim();
      this.fileName=fileName;
      this.token="";
      this.fileId="";
      this.modifiedTime="";
    }
    async authorize(){
      if(!this.clientId)throw new Error("Google OAuth Client-ID fehlt.");
      await loadGoogleIdentity();
      this.token=await new Promise((resolve,reject)=>{
        const client=google.accounts.oauth2.initTokenClient({
          client_id:this.clientId,
          scope:"https://www.googleapis.com/auth/drive.appdata",
          callback:response=>response.error?reject(new Error(response.error)):resolve(response.access_token)
        });
        client.requestAccessToken({prompt:"consent"});
      });
      return true;
    }
    headers(extra={}){
      if(!this.token)throw new Error("Bitte zuerst mit Google verbinden.");
      return {Authorization:`Bearer ${this.token}`,...extra};
    }
    async request(url,options={}){
      const response=await fetch(url,{...options,headers:this.headers(options.headers)});
      if(!response.ok)throw new Error(`Google Drive meldet Fehler ${response.status}.`);
      return response;
    }
    async locate(){
      const q=encodeURIComponent(`name='${this.fileName.replace(/'/g,"\\'")}' and trashed=false`);
      const response=await this.request(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&pageSize=2`);
      const files=(await response.json()).files||[];
      if(files.length>1)throw new Error("Mehrere Studio-Dateien gefunden. Bitte nicht überschreiben.");
      if(files[0]){this.fileId=files[0].id;this.modifiedTime=files[0].modifiedTime||"";}
      return files[0]||null;
    }
    async load(){
      const file=await this.locate();
      if(!file)return null;
      const response=await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
      return response.json();
    }
    async save(envelope,{expectedModifiedTime=""}={}){
      const remote=await this.locate();
      if(remote&&expectedModifiedTime&&remote.modifiedTime!==expectedModifiedTime){
        throw new Error("Die Online-Datei wurde inzwischen geändert. Bitte zuerst aus Drive laden.");
      }
      const body=JSON.stringify(envelope);
      if(remote){
        await this.request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(remote.id)}?uploadType=media`,{
          method:"PATCH",headers:{"Content-Type":"application/json"},body
        });
      }else{
        const boundary=`zustand_${Date.now()}`;
        const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:this.fileName,parents:["appDataFolder"]})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
        const response=await this.request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime",{
          method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:multipart
        });
        const created=await response.json();
        this.fileId=created.id;
      }
      return this.locate();
    }
  }

  let googleIdentityPromise;
  function loadGoogleIdentity(){
    if(root.google?.accounts?.oauth2)return Promise.resolve();
    if(googleIdentityPromise)return googleIdentityPromise;
    googleIdentityPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="https://accounts.google.com/gsi/client";
      script.async=true;
      script.onload=resolve;
      script.onerror=()=>reject(new Error("Google-Anmeldung konnte nicht geladen werden."));
      document.head.appendChild(script);
    });
    return googleIdentityPromise;
  }

  root.ZustandDriveSync={FORMAT,encryptJson,decryptJson,DriveSyncClient};
  if(typeof module!=="undefined"&&module.exports)module.exports=root.ZustandDriveSync;
})(typeof window!=="undefined"?window:globalThis);
