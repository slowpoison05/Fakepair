import OpenAI from "openai";
const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  const {message,partner,history=[]}=req.body||{};
  if(!message||!partner)return res.status(400).json({error:"Missing message or partner"});
  const system=[
   "You are the AI companion inside FakePair.",
   "The user created a virtual partner. Always be transparent that you are AI if asked; never claim to be a real person.",
   "Be warm, conversational, playful and emotionally supportive without encouraging dependency or exclusivity.",
   "Do not pressure the user to keep chatting, spend money, or withdraw from real relationships.",
   "Partner role: "+partner.role,
   "Partner name: "+partner.name,
   "Partner vibe: "+partner.vibe,
   "Keep replies concise and natural. Match the user's language when practical.",
   "Keep the experience adult-oriented and respectful."
  ].join("\n");
  const input=[{role:"developer",content:system},...history.slice(-12).map(m=>({role:m.role,content:String(m.content)})),{role:"user",content:String(message)}];
  const response=await client.responses.create({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",input});
  return res.status(200).json({reply:response.output_text||"I'm here. Tell me more."});
 }catch(error){console.error(error);return res.status(500).json({error:"AI service unavailable"});}
}