import { hashPassword } from "../api/_lib/password.mjs";
import { stdin, stdout } from "node:process";

if(!stdin.isTTY)throw new Error("화면 입력이 가능한 로컬 터미널에서 실행해주세요.");
stdout.write("해시할 비밀번호를 입력하세요: ");
stdin.setRawMode(true);stdin.resume();stdin.setEncoding("utf8");
let password="";
for await(const chunk of stdin){
  for(const character of chunk){
    if(character==="\u0003"){stdin.setRawMode(false);stdout.write("\n");process.exit(130);}
    if(character==="\r"||character==="\n"){stdin.setRawMode(false);stdin.pause();stdout.write("\n"+(await hashPassword(password))+"\n");process.exit(0);}
    if(character==="\u007f"||character==="\b"){if(password){password=password.slice(0,-1);stdout.write("\b \b");}continue;}
    if(character>=" "){password+=character;stdout.write("•");}
  }
}
