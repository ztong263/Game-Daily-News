export function cloudEnabled(){return process.env.STORAGE_MODE==="supabase"||process.env.VERCEL==="1";}
export function publicSupabaseConfig(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error("SUPABASE_NOT_CONFIGURED");
 return {url,key};
}
