import {zodTextFormat} from "openai/helpers/zod";
import type {z} from "zod";
// The API rejects JSON Schema format:uri. Keep URL validation in Zod after parsing,
// while sending plain strings for URL fields in the API's supported schema subset.
export function editorialFormat<T extends z.ZodType>(schema:T,name:string){
 const format=zodTextFormat(schema,name);
 function visit(value:unknown){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object"){const record=value as Record<string,unknown>;if(record.format==="uri")delete record.format;Object.values(record).forEach(visit);}}
 visit(format.schema);return format;
}
