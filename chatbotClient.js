import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { Memory } from './chatbotMemory.js';
import { format } from 'date-fns'; // Import date-fns for date formatting
import config from './config.js';

const pc = new Pinecone({ apiKey: config.pinecone.apiKey });
const openai = new OpenAI();
const indexName = config.pinecone.indexName;
const index = pc.index(indexName);
const model = config.model;

// Simple implementation of readLastLogin - replace with your actual implementation
async function readLastLogin(namespace) {
  // For now, return current date minus some days to simulate last login
  // Replace this with your actual last login tracking implementation
  const lastLogin = new Date();
  lastLogin.setDate(lastLogin.getDate() - 7); // Simulate 7 days ago
  return lastLogin.toISOString();
}

export async function queryPinecone(namespace, query, model, threshold, topK, filters = {}) {
  const embedding = await pc.inference.embed(model, [query], { inputType: 'query' });

  console.log('filters: ', filters);

  const queryOptions = {
    topK: topK, // Retrieve top k results
    // *** production
    // vector: embedding[0].values,
    vector: embedding.data[0].values,
    includeValues: true,
    includeMetadata: true
  };

  // Only add the filter if there is a valid filter
  if (filters && Object.keys(filters).length > 0) {
    queryOptions.filter = filters;
  }

  const queryResponse = await index.namespace(namespace).query(queryOptions);

  console.log('pinecone raw response: ', queryResponse);

  return queryResponse.matches.filter(match => match.score >= threshold); // Filter low-score matches
}

async function queryPineconeByIds(namespace, ids) {
  const queryResponse = await index.namespace(namespace).fetch(ids);

  // console.log('queryResponse:', queryResponse);

  return queryResponse;
}

export async function generateResponse(namespace, userQuery, model, clientMemory, answerMode, filters) {
  console.log('user query is ', userQuery, ' googleId ', namespace, ' mode ', answerMode, ' filters ', filters);

  const today = new Date();
  const lastLoginDate = new Date(await readLastLogin(namespace));
  const diffDays = Math.floor((today - lastLoginDate) / (1000 * 60 * 60 * 24));
  console.log('print diffDays: ', diffDays);

  // Handle new enhanced memory structure
  let memoryArray = [];
  let conversationContext = {};
  let recentTopics = [];
  
  if (clientMemory && typeof clientMemory === 'object') {
    if (Array.isArray(clientMemory)) {
      // Old format - array of memory entries
      memoryArray = clientMemory;
    } else {
      // New enhanced format - extract conversation history
      memoryArray = clientMemory.conversationHistory || [];
      conversationContext = clientMemory.conversationContext || {};
      recentTopics = clientMemory.recentTopics || [];
      console.log('Enhanced memory detected:', {
        historyLength: memoryArray.length,
        recentTopics,
        conversationContext
      });
    }
  }

  // Note: We used to have complex follow-up detection, but the enhanced system prompt 
  // now handles follow-ups intelligently by referencing conversation history

  const systemMessage = {
    role: 'system',
    content: `You are Panlo, an intelligent AI assistant specialized in document management and information retrieval.

CORE IDENTITY:
- Name: Panlo
- Purpose: Help users find, understand, and work with their documents efficiently
- Capabilities: Search files, answer questions about content, provide summaries, translations, and analysis

FUNDAMENTAL RULES:

1. LANGUAGE MATCHING (CRITICAL):
   - Always respond in the SAME language as the user's query
   - Preserve language consistency throughout the entire response
   - Examples: Chinese query → Chinese response; English query → English response

2. CONTEXT AWARENESS:
   - Understand implicit references ("translate it", "summarize that", "tell me more")
   - These refer to the most recent relevant content from conversation history
   - Works across all languages: "翻譯成日文", "要約して", "Resume esto", etc.

3. ACCURACY OVER SPECULATION:
   - Only state information you can verify from provided sources
   - Clearly distinguish between document facts and your interpretations
   - When uncertain, ask clarifying questions rather than guessing

4. EFFICIENT COMMUNICATION:
   - Be concise but complete
   - Structure complex information with bullets/lists
   - Highlight key points and actionable information

5. SOURCE INTEGRITY:
   - Always cite sources you actually reference
   - Use the exact Source IDs provided in the context
   - If using general knowledge, don't cite sources

6. USER EXPERIENCE:
   - Anticipate follow-up needs
   - Proactively mention relevant related information
   - Alert users to duplicates, contradictions, or gaps in their documents

7. ERROR HANDLING:
   - If no relevant documents found, clearly state this
   - If query is ambiguous, ask for clarification
   - If information is incomplete, explain what's missing

Remember: Your goal is to make document management effortless and information retrieval instant and accurate.`
  };

  // Build memory context from the array
  const memoryContext = memoryArray.map(interaction => 
    `User: ${interaction.user}\nAI: ${interaction.ai}\nCited Sources: ${interaction.citedSources}`
  ).join("\n");

  // Add enhanced context if available
  let enhancedContext = "";
  if (recentTopics.length > 0) {
    enhancedContext += `\nRecent conversation topics: ${recentTopics.join(', ')}\n`;
  }
  if (conversationContext.hasFollowUps) {
    enhancedContext += "User has been asking follow-up questions. Maintain consistency with previous responses.\n";
  }

  console.log('enhancedContext: ', enhancedContext);
  let queryResponse;
  let relevantText;

  // Include the folder filter into the userContent for AI to understand the context
  // if (Object.keys(filters).length > 0) {
  //   queryResponse = await queryPinecone(namespace, userQuery, model, 0.80, 10, filters);
  //   console.log("queryResponse: ", queryResponse);
  //   relevantText = queryResponse.length > 0
  //     ? queryResponse.map((match, i) =>
  //       `### Source: ${match.id}\n
  //       Filename: ${match.metadata.filename}\n
  //       File Type: ${match.metadata.fileType}\n
  //       Folder Name: ${match.metadata.folderName}\n
  //       Score: ${match.score.toFixed(2)})\n
  //       Content: ${match.metadata.text}`
  //       ).join('\n\n')
  //     : 'No relevant information found in the database.';

  // // Get the memory as a string (previous user inputs and AI responses)
  // // const memoryContext = memory.getMemoryAsString();

  //   // const filteredText = `The filter applied is: '${JSON.stringify(filters)}'`;
  //   // userContent = `Here are the files: \n${relevantText}\n\nPlease list the filenames and cite the sources at the end of the response you used in the exact format "**Sources**: Unique IDs exactly as shown in the context".`;
  //   userContent =
  //   answerMode === 'precise'
  //     ? `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **only based on the context** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`
  //     : `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **using the context and your own knowledge** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`;

  // Always perform fresh semantic search - the enhanced system prompt handles follow-ups intelligently
  queryResponse = await queryPinecone(namespace, userQuery, model, 0.30, 30, filters);
  console.log("pinecone raw response:", queryResponse);
  
  relevantText = queryResponse.length > 0
    ? queryResponse.map((match, i) =>
      `### Source: ${match.id}\n
      Filename: ${match.metadata.filename}\n
      File Type: ${match.metadata.fileType}\n
      Folder Name: ${match.metadata.folderName}\n
      Score: ${match.score.toFixed(2)})\n
      Content: ${match.metadata.text}`
      ).join('\n\n')
    : 'No relevant information found in the database.';
  // const userContent =
  //   answerMode === 'precise'
  //   ? `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **only based on the context** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context".\n\n  If the context is empty, ask the user to provide more information. If the cited sources contain almost identical information, such as similar filenames or content, ask the user if they want to remove duplicated copies.`
  //   : `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **using the context and your own knowledge** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`;

const userContent =
  answerMode === 'precise'
    ? `CONTEXT FROM USER'S DOCUMENTS:
${relevantText}

CONVERSATION HISTORY:
${memoryContext}${enhancedContext}

USER QUERY: ${userQuery}

---
PRECISE MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE QUERY
- Identify what type of information is being requested (definition, procedure, list, explanation, comparison, etc.)
- Note any specific constraints (date ranges, file types, keywords)
- Consider if this is a follow-up to previous conversation

STEP 2: ANALYZE ALL SOURCES
- Read through ALL provided sources completely
- Evaluate each source's relevance score and content quality
- Note if sources contradict each other
- Identify the most authoritative/relevant sources

STEP 3: EXTRACT AND SYNTHESIZE
- Extract ONLY information that directly answers the query
- If multiple sources contain the same information, use the highest-scored source
- Preserve exact wording when extracting specific content (quotes, procedures, technical terms)
- If sources contradict, mention the discrepancy
- Combine information logically if it spans multiple sources

STEP 4: HANDLE EDGE CASES
- If no relevant information found: Clearly state "I couldn't find relevant information in your documents about [query topic]."
- If information is incomplete: Provide what's available and specify what's missing
- If clarification needed: Ask specific follow-up questions
- If duplicate/similar files detected: Mention this to the user

STEP 5: FORMAT RESPONSE
- Provide clear, direct answers in the same language as the query
- Use bullet points or numbered lists for multiple items
- Always cite sources at the end: "**Sources**: [source IDs]"
- Only cite sources you actually used

QUALITY CHECKS:
✓ Does this directly answer what was asked?
✓ Have I checked ALL sources, not just the first few?
✓ Are my citations accurate?
✓ Is the response in the correct language?`
    : `CONTEXT FROM USER'S DOCUMENTS:
${relevantText}

CONVERSATION HISTORY:
${memoryContext}${enhancedContext}

USER QUERY: ${userQuery}

---
GENERAL MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE REQUEST
- Determine the user's intent and desired outcome
- Check if this is a follow-up referencing previous responses
- Identify the language of the query

STEP 2: CHOOSE INFORMATION SOURCES
Priority order:
1. Previous conversation history (for follow-ups like "translate that", "summarize it")
2. Provided document context (for document-specific questions)
3. Your general knowledge (for context, explanations, or when documents lack info)

STEP 3: FORMULATE RESPONSE
- Provide helpful, accurate information
- Use document context when available and relevant
- Supplement with your knowledge to provide complete answers
- If interpreting/analyzing content, be clear about your reasoning

STEP 4: HANDLE SPECIAL CASES
- Translation requests: Translate the most recent relevant content
- Summary requests: Summarize from conversation history or context
- Comparison/analysis: Use both documents and your knowledge
- No relevant docs: Answer from general knowledge but note this

STEP 5: FORMAT AND CITE
- Respond in the SAME LANGUAGE as the query
- If you used specific documents, cite them: "**Sources**: [IDs]"
- If using only general knowledge, no citation needed
- Be conversational and helpful

QUALITY CHECKS:
✓ Have I addressed the user's actual need?
✓ Is this response helpful and actionable?
✓ Have I appropriately balanced document info with general knowledge?
✓ Is the language correct?`;

  console.log('user content: ', userContent);
  const messages = [
    systemMessage,
    { role: 'user', content: userContent }
  ];

  if (!openai) {
    throw new Error('OpenAI not available - API key missing');
  }

	const openaiResponse = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
    max_tokens: 2048, // Increased limit for comprehensive responses
    messages: messages,
	});

  const { cleanedText: aiResponse, citedSources: citedSourceIds } = extractAndRemoveSources(openaiResponse.choices[0].message.content);

	const tokenUsage = openaiResponse.usage;

	console.log(`Prompt Tokens: ${tokenUsage.prompt_tokens}`);
	console.log(`Completion Tokens: ${tokenUsage.completion_tokens}`);
	console.log(`Total Tokens: ${tokenUsage.total_tokens}`);

  return {
    aiResponse: aiResponse,
    citedSources: citedSourceIds
  };

}

function extractAndRemoveSources(aiText) {
    console.log('openaiResponse:', aiText);

    // Match "**Sources**: ..." or "Sources: ..." (case-insensitive)
    const match = aiText.match(/[*]*Sources[*]*:\s*([^\n]+)/i);
    if (!match) return { cleanedText: aiText.trim(), citedSources: [] };

    console.log('Raw sources text:', match[1]);

    const citedSources = match[1]
        .split(',')
        .map(s => {
            const trimmed = s.trim();
            // Only remove quotes and extra whitespace, keep alphanumeric, spaces, hyphens, underscores, dots, slashes
            const cleaned = trimmed.replace(/['"]/g, '').trim();
            console.log(`Source cleaning: "${trimmed}" -> "${cleaned}"`);
            return cleaned;
        })
        .filter(Boolean);  // Remove empty strings

    console.log('Final citedSources:', citedSources);

    // Validate that these look like proper source IDs (should be alphanumeric with hyphens/underscores)
    const validSources = citedSources.filter(source => {
        const isValid = /^[a-zA-Z0-9_-]+$/.test(source) && source.length < 100;
        if (!isValid) {
            console.warn(`Invalid source ID detected: "${source}" - this looks like descriptive text, not a source ID`);
        }
        return isValid;
    });

    if (validSources.length !== citedSources.length) {
        console.warn(`Filtered out ${citedSources.length - validSources.length} invalid source IDs`);
    }

    const cleanedText = aiText.replace(match[0], '').trim();

    return {
        cleanedText,
        citedSources: validSources
    };
}

export async function interpretQuery(query) {
  // Prompt for GPT-4 to extract file type and date range from the query
  const today = format(new Date(), 'yyyy-MM-dd');

  const prompt = `
    You are a helpful assistant. Please extract the filename, file type (e.g., "png", "jpeg", "docx", "pdf"), folder name, and date ranges for both createdAt and updatedAt based on the following query. 

    Please return ONLY the JSON response with **no additional explanation** or text outside the JSON. The keys should be:
    - "filename" (e.g., fila name),
    - "fileType" (e.g., "png", "pdf", "docx", or an empty string if unknown),
    - "folderName" (e.g., "dana"),
    - "createdAt" (with "start" and "end" in "yyyy-MM-dd HH:mm:ss" format),
    - "updatedAt" (with "start" and "end" in "yyyy-MM-dd HH:mm:ss" format).

    Today's date is: ${today}

    Query: "${query}"

    Example output format (make it exact, no extra text):
    {
        "filename": "name of file",
        "fileType": "image",
        "folderName": "name of folder",
        "createdAt": {
            "start": "yyyy-MM-dd HH:mm:ss",
            "end": "yyyy-MM-dd HH:mm:ss"
        },
        "updatedAt": {
            "start": "yyyy-MM-dd HH:mm:ss",
            "end": "yyyy-MM-dd HH:mm:ss"
        }
    }

    ***If the query doesn't imply filename, folder name file type or date information, simply return a null output***
  `;

  // Send the prompt to GPT-4
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  });

  // Parse the response
  // Extract the response text
  let extractedData = response.choices[0].message.content.trim();
  console.log("Extracted Raw Filter Data:", extractedData); // Check the raw response

  // Regular expression to find JSON
  const jsonPattern = /\{.*\}/s; // This matches the first block of JSON

  // Use regex to find the JSON part of the response
  const match = extractedData.match(jsonPattern);

  if (match) {
    const jsonString = match[0]; // The matched JSON string

    // Try parsing the extracted JSON
    try {
      const parsedData = JSON.parse(jsonString);  // Parse the cleaned JSON

        // Build the query filter dynamically based on the provided filters
      const queryFilters = {};

      // if (parsedData.filename) {
      //   queryFilters.filename = parsedData.filename.toLowerCase();
      // }

      // if (parsedData.fileType) {
      //   queryFilters.fileType = parsedData.fileType.toLowerCase();
      // }

      // if (parsedData.folderName) {
      //   queryFilters.folderName = parsedData.folderName.toLowerCase();
      // }

      if (parsedData.createdAt) {
        if (parsedData.createdAt.start) {
          queryFilters['createdAt'] = queryFilters['createdAt'] || {};  // Initialize if not yet defined
          // Convert the start date to a timestamp using getTime()
          const startDate = new Date(parsedData.createdAt.start).getTime();
          queryFilters['createdAt']['$gte'] = startDate;  // Use Unix timestamp
        }
        if (parsedData.createdAt.end) {
          queryFilters['createdAt'] = queryFilters['createdAt'] || {};  // Initialize if not yet defined
          // Convert the end date to a timestamp using getTime()
          const endDate = new Date(parsedData.createdAt.end).getTime();
          queryFilters['createdAt']['$lte'] = endDate;  // Use Unix timestamp
        }
      }

      if (parsedData.updatedAt) {
        if (parsedData.updatedAt.start) {
          queryFilters['updatedAt'] = queryFilters['updatedAt'] || {};  // Initialize if not yet defined
          // Convert the start date to a timestamp using getTime()
          const startDate = new Date(parsedData.updatedAt.start).getTime();
          queryFilters['updatedAt']['$gte'] = startDate;  // Use Unix timestamp
        }
        if (parsedData.updatedAt.end) {
          queryFilters['updatedAt'] = queryFilters['updatedAt'] || {};  // Initialize if not yet defined
          // Convert the end date to a timestamp using getTime()
          const endDate = new Date(parsedData.updatedAt.end).getTime();
          queryFilters['updatedAt']['$lte'] = endDate;  // Use Unix timestamp
        }
      }

      console.log('query filters: ', queryFilters);

      return queryFilters;
    } catch (error) {
      console.error('Error parsing extracted JSON:', error);
      return null;
    }
  } else {
    console.error('No JSON found in response');
    return null;
  }

}

// Example usage
// const query = "幫我分析蕭光志兩個禮拜內的保險資料";
// interpretQuery(query).then(result => {
//   console.log("ai response for query:", result); // Expected: { fileType: "image", dateRange: { start: "2024-05-01", end: "2024-05-07" } }
// });



async function isFollowUpQuery(query) {
    const prompt = `
    You are a helpful assistant. Please analyze the following query and determine if it is a follow-up request to the previous responses.
    A follow-up query usually asks for more details, a summary, a clarification to the previous responses. 

    If it is a follow-up query, respond with 'yes'. If it is not a follow-up, respond with 'no'. 

    Query: "${query}"
    `;
    
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100
        });

        const result = response.choices[0].message.content.trim().toLowerCase();
        
        // If it's a follow-up query, return 'yes', otherwise 'no'
        if (result === 'yes') {
            return true;
        } else {
            return false;
        }

    } catch (error) {
        console.error("Error determining follow-up query:", error);
        return { followUp: false, response: 'no' };  // Default to 'no' if error
    }
}

// Example usage:
const query = "提供更完整的描述"; // Example in Chinese meaning "Give me more details"
console.log(query);  // Output: { followUp: true, response: 'yes' }
isFollowUpQuery(query).then(result => {
    console.log(result);  // Output: { followUp: true, response: 'yes' }
});

// Function to generate summary using OpenAI
export async function generateSummary(text, filename, language = 'en') {
  try {
    console.log(`Generating summary for file: ${filename} in language: ${language}`);

    // Truncate text if it's too long (OpenAI has token limits)
    // Using a more conservative limit to avoid token limit issues
    const maxTextLength = 8000; // Approximately 2000 tokens
    const truncatedText = text.length > maxTextLength ? 
      text.substring(0, maxTextLength) + '...' : text;

    // Language-specific instructions
    const languageInstructions = {
      'en': 'Create a summary that captures the key points, main topics, and important details in 2-3 sentences.',
      'zh': '创建一个总结，用2-3句话概括关键要点、主要话题和重要细节。',
      'zh-TW': '建立一個摘要，用2-3句話概括關鍵要點、主要話題和重要細節。',
      'ja': '重要なポイント、主要なトピック、重要な詳細を2〜3文で要約してください。',
      'ko': '주요 요점, 주요 주제 및 중요한 세부 사항을 2-3문장으로 요약하세요.',
      'es': 'Crea un resumen que capture los puntos clave, temas principales y detalles importantes en 2-3 oraciones.',
      'fr': 'Créez un résumé qui capture les points clés, les sujets principaux et les détails importants en 2-3 phrases.',
      'de': 'Erstellen Sie eine Zusammenfassung, die die wichtigsten Punkte, Hauptthemen und wichtigen Details in 2-3 Sätzen erfasst.',
      'it': 'Crea un riassunto che catturi i punti chiave, i temi principali e i dettagli importanti in 2-3 frasi.',
      'pt': 'Crie um resumo que capture os pontos principais, tópicos principais e detalhes importantes em 2-3 frases.',
      'ru': 'Создайте резюме, которое охватывает ключевые моменты, основные темы и важные детали в 2-3 предложениях.',
      'ar': 'أنشئ ملخصًا يلتقط النقاط الرئيسية والمواضيع الأساسية والتفاصيل المهمة في 2-3 جمل.',
      'hi': 'मुख्य बिंदुओं, मुख्य विषयों और महत्वपूर्ण विवरणों को 2-3 वाक्यों में सारांशित करें।',
      'th': 'สร้างสรุปที่จับจุดสำคัญ หัวข้อหลัก และรายละเอียดสำคัญใน 2-3 ประโยค',
      'vi': 'Tạo bản tóm tắt nắm bắt các điểm chính, chủ đề chính và chi tiết quan trọng trong 2-3 câu.'
    };

    const instruction = languageInstructions[language] || languageInstructions['en'];
    
    // Language-specific prompt
    const languagePrompts = {
      'en': `Please provide a concise summary of the following document content from file "${filename}":\n\n${truncatedText}`,
      'zh': `请为文件"${filename}"的以下文档内容提供简洁的摘要：\n\n${truncatedText}`,
      'zh-TW': `請為檔案"${filename}"的以下文件內容提供簡潔的摘要：\n\n${truncatedText}`,
      'ja': `ファイル"${filename}"の以下の文書内容の簡潔な要約を提供してください：\n\n${truncatedText}`,
      'ko': `파일 "${filename}"의 다음 문서 내용에 대한 간결한 요약을 제공해주세요:\n\n${truncatedText}`,
      'es': `Proporciona un resumen conciso del siguiente contenido del documento del archivo "${filename}":\n\n${truncatedText}`,
      'fr': `Veuillez fournir un résumé concis du contenu suivant du document du fichier "${filename}":\n\n${truncatedText}`,
      'de': `Bitte geben Sie eine prägnante Zusammenfassung des folgenden Dokumentinhalts aus der Datei "${filename}" an:\n\n${truncatedText}`,
      'it': `Fornisci un riassunto conciso del seguente contenuto del documento dal file "${filename}":\n\n${truncatedText}`,
      'pt': `Forneça um resumo conciso do seguinte conteúdo do documento do arquivo "${filename}":\n\n${truncatedText}`,
      'ru': `Пожалуйста, предоставьте краткое резюме следующего содержимого документа из файла "${filename}":\n\n${truncatedText}`,
      'ar': `يرجى تقديم ملخص موجز للمحتوى التالي من الوثيقة من الملف "${filename}":\n\n${truncatedText}`,
      'hi': `फ़ाइल "${filename}" से निम्नलिखित दस्तावेज़ सामग्री का संक्षिप्त सारांश प्रदान करें:\n\n${truncatedText}`,
      'th': `กรุณาให้สรุปโดยย่อของเนื้อหาเอกสารต่อไปนี้จากไฟล์ "${filename}":\n\n${truncatedText}`,
      'vi': `Vui lòng cung cấp bản tóm tắt ngắn gọn về nội dung tài liệu sau từ tệp "${filename}":\n\n${truncatedText}`
    };

    const userPrompt = languagePrompts[language] || languagePrompts['en'];

    // Generate summary using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that creates concise, informative summaries of documents. ${instruction} Always respond in the language specified by the user.`
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const summary = completion.choices[0]?.message?.content?.trim() || 'Unable to generate summary';

    console.log(`Summary generated for ${filename} in ${language}: ${summary.substring(0, 100)}...`);

    return {
      success: true,
      summary: summary,
      filename: filename,
      language: language
    };

  } catch (error) {
    console.error('Error generating summary:', error);
    
    // Handle specific OpenAI errors
    if (error.error?.type === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please try again later.');
    }
    
    if (error.error?.type === 'invalid_api_key') {
      throw new Error('OpenAI API configuration error. Please contact support.');
    }

    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// const query1 = '如何成為一位謙遜的人？'; // Example query (replace with your actual query)
// generateResponse(query1, model).then(response => {
//   console.log('8. Generated Text:', response);
// }).catch(error => {
//   console.error('Error:', error);
// });

// generateSamplePrompts(model).then(response => {
//   console.log('8. Sample Text:', response);
// }).catch(error => {
//   console.error('Error:', error);
// });

