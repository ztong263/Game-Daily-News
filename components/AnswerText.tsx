export function AnswerText({text}:{text:string}){
  return <>{text.split(/(https?:\/\/[^\s]+)/g).map((part,index)=>/^https?:\/\//.test(part)
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    : part)}</>;
}
