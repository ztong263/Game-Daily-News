export function citationKey(value:string){
 const url=new URL(value);url.hash="";
 for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||["gclid","fbclid","msclkid"].includes(key)||(url.hostname==="store.steampowered.com"&&key==="snr"))url.searchParams.delete(key);
 url.pathname=url.pathname.replace(/\/$/,"")||"/";url.searchParams.sort();return url.toString();
}
