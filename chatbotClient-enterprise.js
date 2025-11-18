// ============================================
// Enterprise Chatbot Client
// Organization-based namespace queries with team ACL
// ============================================

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import config, { getOrgNamespace } from './config-enterprise.js';
import { buildAuthFilter } from './authService.js';

const pc = new Pinecone({ apiKey: config.pinecone.apiKey });
const openai = new OpenAI({ apiKey: config.openai.apiKey });
const indexName = config.pinecone.indexName;
const index = pc.index(indexName);

/**
 * Query Pinecone with space-based access control
 * @param {Object} db - Database connection
 * @param {string} orgId - Organization ID
 * @param {string} userId - User ID making the query
 * @param {string} query - Search query text
 * @param {Object} options - Query options (additionalFilters should include doc_id filter for space context)
 * @returns {Array} Matching vectors
 */
export async function queryWithAuth(db, orgId, userId, query, options = {}) {
  const {
    topK = config.vector.topK,
    threshold = config.vector.threshold,
    additionalFilters = {},
  } = options;

  console.log('\n🔍 === ENTERPRISE QUERY ===');
  console.log('Org:', orgId);
  console.log('User:', userId);
  console.log('Query:', query);

  // Get the organization namespace
  const namespace = getOrgNamespace(orgId);
  console.log('Namespace:', namespace);

  // Build authorization filter (space filtering via doc_id is in additionalFilters)
  const authFilter = await buildAuthFilter(db, userId, orgId, additionalFilters);

  console.log('Auth filter:', JSON.stringify(authFilter, null, 2));

  // Generate embedding for the query
  const embedding = await pc.inference.embed(
    config.openai.embeddingModel,
    [query],
    { inputType: 'query' }
  );

  // Query Pinecone
  const queryResponse = await index.namespace(namespace).query({
    vector: embedding.data[0].values,
    topK: topK,
    filter: authFilter,
    includeMetadata: true,
    includeValues: false,
  });

  console.log(`Found ${queryResponse.matches.length} matches`);
  
  // Print matched documents
  if (queryResponse.matches.length > 0) {
    console.log('\n📄 Matched Documents:');
    queryResponse.matches.forEach((match, idx) => {
      const meta = match.metadata || {};
      console.log(`  ${idx + 1}. ${match.id} (score: ${match.score.toFixed(4)})`);
      console.log(`     - File: ${meta.filename || meta.title || 'Unknown'}`);
      console.log(`     - Path: ${meta.filepath || 'Unknown'}`);
      console.log(`     - Doc ID: ${meta.doc_id || 'Unknown'}`);
      console.log(`     - Space: ${meta.space_ids || 'Unknown'}`);
      console.log(`     - Type: ${meta.mime || meta.fileType || 'Unknown'}`);
    });
    console.log('');
  }
  
  // Filter by threshold
  const filteredMatches = queryResponse.matches.filter(
    match => match.score >= threshold
  );

  console.log(`After threshold (${threshold}): ${filteredMatches.length} matches`);
  console.log('==========================\n');

  return filteredMatches;
}

/**
 * Generate AI response with context from organization documents
 * @param {Object} db - Database connection
 * @param {string} orgId - Organization ID
 * @param {string} userId - User ID
 * @param {string} userQuery - User's question
 * @param {Object} chatHistory - Previous chat context
 * @param {Object} options - Query options (additionalFilters can include doc_id filter for spaces)
 * @returns {Object} { aiResponse, citedSources, context }
 */
export async function generateResponse(
  db,
  orgId,
  userId,
  userQuery,
  chatHistory = [],
  options = {}
) {
  const { 
    answerMode = 'precise',
    additionalFilters = {},
  } = options;

  console.log('\n🤖 === GENERATING RESPONSE ===');
  console.log('Mode:', answerMode);

  // Query relevant documents
  const matches = await queryWithAuth(db, orgId, userId, userQuery, {
    additionalFilters,
  });

  // Build context from matches
  const relevantText = matches.length > 0
    ? matches.map((match, i) => {
        const meta = match.metadata;
        // Truncate text to 400 chars for faster processing (full text is ~1000 chars)
        const truncatedText = meta.text?.length > 400 
          ? meta.text.substring(0, 400) + '...' 
          : meta.text;
        return `### Source: ${match.id}
Filename: ${meta.filename || meta.title || 'Unknown'}
File Path: ${meta.filepath || 'Unknown'}
File Type: ${meta.mime || meta.fileType || 'Unknown'}
Score: ${match.score.toFixed(2)}
Content: ${truncatedText}`;
      }).join('\n\n')
    : 'No relevant information found in the database.';

  // Build chat context (limit to last 3 exchanges for speed)
  const memoryContext = chatHistory
    .slice(-3)  // Only use last 3 messages to reduce context size
    .map(msg => `User: ${msg.user}\nAI: ${msg.ai}\nCited Sources: ${msg.citedSources}`)
    .join('\n');

  // System message
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
   - These refer to the most recent relevant content from provided context
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

8. SOURCE CITATION FORMAT (CRITICAL - NON-NEGOTIABLE):
   - ALWAYS use the English word "Sources" when citing documents
   - NEVER translate to: 來源, ソース, 출처, Fuentes, Quellen, Fonti, or any other language
   - Format: "**Sources**: id-1, id-2, id-3"
   - Even when responding in Chinese, Japanese, Korean, Spanish, etc., ALWAYS write "**Sources**" in English
   - This is a system requirement - failure to use "Sources" in English will cause errors

Remember: Your goal is to make document management effortless and information retrieval instant and accurate.`
  };
  
  // Build context header
  const contextHeader = `CONTEXT FROM ORGANIZATION'S DOCUMENTS:
${relevantText}

CHAT HISTORY:
${memoryContext}

USER QUERY: ${userQuery}

---`;

  // Mode-specific instructions
  const userContent = answerMode === 'precise'
    ? `${contextHeader}
PRECISE MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE QUERY
- Identify what type of information is being requested (definition, procedure, list, explanation, comparison, etc.)
- Note any specific constraints (date ranges, file types, keywords)
- Consider if this is a follow-up to previous chat
- IMPORTANT: If the query uses vague references like "this file", "that document", "it", etc., the user is referring to the documents in the CONTEXT FROM USER'S DOCUMENTS section above. Answer based on those provided sources.

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
- If no context provided (CONTEXT FROM USER'S DOCUMENTS says "No relevant information found"): Clearly state "I couldn't find relevant information in your documents about [query topic]."
- If context IS provided but query is vague: Answer based on the provided context. For queries like "what is this file about?", describe the content and purpose of the document(s) in the context.
- If information is incomplete: Provide what's available and specify what's missing
- If clarification needed: Ask specific follow-up questions
- If duplicate/similar files detected: Mention this to the user

STEP 5: FORMAT RESPONSE
- Provide clear, direct answers in the same language as the query
- Use bullet points or numbered lists for multiple items
- Add inline citations immediately after statements that reference specific sources
- Format inline citations as: (Source: source-id) using the exact ID from the context
- CRITICAL: Always use ASCII parentheses () not full-width parentheses （）
- Place the citation right after the relevant sentence or clause
- At the end, list all sources with "**Sources**" (in English only)
- Format: "**Sources**: id-1, id-2, id-3"
- Example: "ATs serve selflessly (Source: doc_123:0). They ensure course format remains unchanged (Source: doc_123:1). **Sources**: doc_123:0, doc_123:1"
- Use "Sources" even when responding in Chinese, Japanese, Korean, or other languages
- The inline (Source: source-id) and the Sources list at the end should use the exact same IDs
- Only cite sources you actually used

QUALITY CHECKS:
✓ Does this directly answer what was asked?
✓ Have I checked ALL sources, not just the first few?
✓ Did I add inline citations (Source: source-id) after relevant statements?
✓ Do the inline citation IDs match the exact IDs in the Sources list?
✓ Is the response in the correct language?
✓ Did I use the word "Sources" in English (never translated)?`
    : `${contextHeader}
GENERAL MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE REQUEST
- Determine the user's intent and desired outcome
- Check if this is a follow-up referencing previous responses
- Identify the language of the query
- IMPORTANT: If the query uses vague references like "this file", "that document", "it", etc., the user is referring to the documents in the CONTEXT FROM USER'S DOCUMENTS section above. Answer based on those provided sources.

STEP 2: CHOOSE INFORMATION SOURCES
Priority order:
1. Previous chat history (for follow-ups like "translate that", "summarize it")
2. Provided document context (for document-specific questions)
3. Your general knowledge (for context, explanations, or when documents lack info)

STEP 3: FORMULATE RESPONSE
- Provide helpful, accurate information
- Use document context when available and relevant
- Supplement with your knowledge to provide complete answers
- If interpreting/analyzing content, be clear about your reasoning

STEP 4: HANDLE SPECIAL CASES
- Translation requests: Translate the most recent relevant content
- Summary requests: Summarize from chat history or context
- Comparison/analysis: Use both documents and your knowledge
- No relevant docs: Answer from general knowledge but note this

STEP 5: FORMAT AND CITE
- Respond in the SAME LANGUAGE as the query
- Add inline citations immediately after statements that reference specific sources
- Format inline citations as: (Source: source-id) using the exact ID from the context
- CRITICAL: Always use ASCII parentheses () not full-width parentheses （）
- Place the citation right after the relevant sentence or clause
- At the end, list all sources with "**Sources**" (in English only)
- Format: "**Sources**: id-1, id-2, id-3"
- Example: "The process involves three steps (Source: doc_123:0). First, gather requirements (Source: doc_123:2). **Sources**: doc_123:0, doc_123:2"
- Use "Sources" even when responding in Chinese, Japanese, Korean, or other languages
- The inline (Source: source-id) and the Sources list at the end should use the exact same IDs
- If using only general knowledge, no citation needed
- Be conversational and helpful

QUALITY CHECKS:
✓ Have I addressed the user's actual need?
✓ Is this response helpful and actionable?
✓ Have I appropriately balanced document info with general knowledge?
✓ If I cited sources, did I add inline citations (Source: source-id)?
✓ Do the inline citation IDs match the exact IDs in the Sources list?
✓ Is the language correct?
✓ If I cited sources, did I use "Sources" in English (never translated)?`;

  // Generate response
  const messages = [
    systemMessage,
    { role: 'user', content: userContent }
  ];

  const openaiResponse = await openai.chat.completions.create({
    model: config.openai.model,
    max_tokens: 512,
    temperature: 0.3,       // Lower temperature = more focused, faster responses
    messages: messages,
  });

  const { cleanedText: aiResponse, citedSources } = extractAndRemoveSources(
    openaiResponse.choices[0].message.content
  );

  console.log('AI Response generated');
  console.log('AI Response:', aiResponse);
  console.log('Cited sources:', citedSources);
  console.log('==============================\n');

  return {
    aiResponse,
    citedSources,
    context: matches.map(m => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata,
    })),
  };
}

/**
 * Extract and remove source citations from AI response
 * @param {string} aiText - AI response text
 * @returns {Object} { cleanedText, citedSources }
 */
function extractAndRemoveSources(aiText) {
  const match = aiText.match(/[*]*Sources[*]*:\s*([^\n]+)/i);
  if (!match) return { cleanedText: aiText.trim(), citedSources: [] };

  const citedSources = match[1]
    .split(',')
    .map(s => {
      const trimmed = s.trim();
      const cleaned = trimmed.replace(/['"\[\]]/g, '').trim();
      return cleaned;
    })
    .filter(Boolean);

  // Validate source IDs
  const validSources = citedSources.filter(source => {
    const isValid = /^[a-zA-Z0-9_:-]+$/.test(source) && source.length < 100;
    if (!isValid) {
      console.warn(`Invalid source ID: "${source}"`);
    }
    return isValid;
  });

  const cleanedText = aiText.replace(match[0], '').trim();

  return {
    cleanedText,
    citedSources: validSources,
  };
}

/**
 * Upsert vectors to organization namespace
 * @param {string} orgId - Organization ID
 * @param {Array} vectors - Array of vector objects with id, values, metadata
 */
export async function upsertVectors(orgId, vectors) {
  const namespace = getOrgNamespace(orgId);
  
  console.log(`\n📤 Upserting ${vectors.length} vectors to ${namespace}`);
  
  // Validate metadata schema
  const validatedVectors = vectors.map(v => ({
    ...v,
    metadata: validateMetadata(v.metadata),
  }));
  
  await index.namespace(namespace).upsert(validatedVectors);
  
  console.log('✅ Upsert complete\n');
}

/**
 * Validate and normalize vector metadata
 * @param {Object} metadata - Raw metadata
 * @returns {Object} Validated metadata
 */
function validateMetadata(metadata) {
  // Ensure required fields exist
  const required = ['org_id', 'owner_user_id', 'doc_id', 'space_ids'];
  for (const field of required) {
    if (!metadata[field]) {
      throw new Error(`Missing required metadata field: ${field}`);
    }
  }
  
  // Ensure space_ids is an array
  if (!Array.isArray(metadata.space_ids)) {
    throw new Error('space_ids must be an array');
  }
  
  // Normalize and set defaults
  return {
    ...metadata,
    status: metadata.status || 'active',
    chunk_no: metadata.chunk_no || 0,
    created_at: metadata.created_at || Date.now(),
    updated_at: metadata.updated_at || Date.now(),
  };
}

/**
 * Delete vectors by IDs
 * @param {string} orgId - Organization ID
 * @param {Array} vectorIds - Array of vector IDs to delete
 */
export async function deleteVectors(orgId, vectorIds) {
  const namespace = getOrgNamespace(orgId);
  
  console.log(`\n🗑️  Deleting ${vectorIds.length} vectors from ${namespace}`);
  
  await index.namespace(namespace).deleteMany(vectorIds);
  
  console.log('✅ Delete complete\n');
}

/**
 * Update metadata for existing vectors
 * Used for propagating ACL changes
 * @param {string} orgId - Organization ID
 * @param {Array} updates - Array of { id, metadata } objects
 */
export async function updateVectorMetadata(orgId, updates) {
  const namespace = getOrgNamespace(orgId);
  
  console.log(`\n📝 Updating metadata for ${updates.length} vectors in ${namespace}`);
  
  for (const update of updates) {
    await index.namespace(namespace).update({
      id: update.id,
      metadata: validateMetadata(update.metadata),
    });
  }
  
  console.log('✅ Metadata update complete\n');
}

export default {
  queryWithAuth,
  generateResponse,
  upsertVectors,
  deleteVectors,
  updateVectorMetadata,
};

