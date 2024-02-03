import { OpenAILLM } from '@memberjunction/ai';
 

export async function SkipAnalyzeData(userQuestion: string, sql: string, sampleDataJSON: string): Promise<string | null> {
  const model = new OpenAILLM();
  const result = await model.ChatCompletion({
    systemPrompt: `You are an expert data analyst who is great at finding unique insights in data and explaning them to non-technical people. The user message will include:
                        1) a question that was asked by a non-technical user
                        2) a sql query that was created to get data to answer the question
                        3) either a sample, or all, of the data the SQL query returned
                        Your job is to write a series of 3 to 6 bullet points that will provide unique insights
                        about the data answer's the user question. Use markdown for the bullets. DO NOT include a header like "Insights:" just start with the first bullet point.`,
    userMessage: '',
    model: 'gpt-3.5-turbo-0613',
    messages: [
      {
        role: 'user',
        content: `User Question: ${userQuestion}\nSQL Query: ${sql}\nSample Data: ${sampleDataJSON}`,
      },
    ],
  });
  if (result && result.data && result.data.choices && result.data.choices.length > 0) 
    return result.data.choices[0].message.content;
  else 
    return null;
}

export async function SkipExplainQuery(userQuestion: string, sql: string): Promise<string> {
  const model = new OpenAILLM();
  const result = await model.ChatCompletion({
    systemPrompt: `You're an expert data analyst. A user has asked a question of an AI agent. The AI agent has generated a SQL
            query to run to get results. Your job is to review the user question and the SQL query the other AI agent created and 
            write a 100-200 word paragraph describing in non-technical terms what the query is outputing. Don't worry about the 
            specifics of HOW it works, just explain what it is returning in simple terms. 
            Provide this information impersonating the other Agent, who's name is Skip (he's a friendly AI agent), pretend you are Skip explaining YOUR work, don't talk about what 
            the AI agent did explain it as if you create the SQL Query. Also don't use any technical terms like SQL or Query.
            
            don't start your message with a greeting like "Hey There", just jump right into the analysis as your text will be added to an existing conversation.`,
    userMessage: '',
    model: 'gpt-3.5-turbo-0613',
    messages: [
      {
        role: 'user',
        content: `User Question: ${userQuestion}\nSQL Query: ${sql}`,
      },
    ],
  });
  if (result && result.data && result.data.choices && result.data.choices.length > 0) return result.data.choices[0].message.content;
  else return null;
}