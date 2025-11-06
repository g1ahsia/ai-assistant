// ============================================
// Enterprise Chatbot Client
// Organization-based namespace queries with team ACL
// ============================================

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import config, { getOrgNamespace } from './config-enterprise.js';
import { buildAuthFilter, buildFolderFilter } from './authService.js';

const pc = new Pinecone({ apiKey: config.pinecone.apiKey });
const openai = new OpenAI({ apiKey: config.openai.apiKey });
const indexName = config.pinecone.indexName;
const index = pc.index(indexName);

/**
 * Query Pinecone with team-based access control
 * @param {Object} db - Database connection
 * @param {string} orgId - Organization ID
 * @param {string} userId - User ID making the query
 * @param {string} query - Search query text
 * @param {Object} options - Query options
 * @returns {Array} Matching vectors
 */
export async function queryWithAuth(db, orgId, userId, query, options = {}) {
  const {
    topK = config.vector.topK,
    threshold = config.vector.threshold,
    folderIds = [],
    additionalFilters = {},
  } = options;

  console.log('\n🔍 === ENTERPRISE QUERY ===');
  console.log('Org:', orgId);
  console.log('User:', userId);
  console.log('Query:', query);

  // Get the organization namespace
  const namespace = getOrgNamespace(orgId);
  console.log('Namespace:', namespace);

  // Build authorization filter
  const authFilter = folderIds.length > 0
    ? await buildFolderFilter(db, userId, orgId, folderIds)
    : await buildAuthFilter(db, userId, orgId, additionalFilters);

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
 * @param {Object} conversationHistory - Previous conversation context
 * @param {Object} options - Query options
 * @returns {Object} { aiResponse, citedSources, context }
 */
export async function generateResponse(
  db,
  orgId,
  userId,
  userQuery,
  conversationHistory = [],
  options = {}
) {
  const { 
    answerMode = 'precise',
    folderIds = [],
    additionalFilters = {},
  } = options;

  console.log('\n🤖 === GENERATING RESPONSE ===');
  console.log('Mode:', answerMode);

  // Query relevant documents
  const matches = await queryWithAuth(db, orgId, userId, userQuery, {
    folderIds,
    additionalFilters,
  });

  // Build context from matches
  const relevantText = matches.length > 0
    ? matches.map((match, i) => {
        const meta = match.metadata;
        return `### Source: ${match.id}
Filename: ${meta.filename || meta.title || 'Unknown'}
File Type: ${meta.mime || meta.fileType || 'Unknown'}
Folder: ${meta.folder_id}
Score: ${match.score.toFixed(2)}
Content: ${meta.text}`;
      }).join('\n\n')
    : 'No relevant information found in the database.';

  // Build conversation context
  const memoryContext = conversationHistory
    .map(msg => `User: ${msg.user}\nAI: ${msg.ai}\nCited Sources: ${msg.citedSources}`)
    .join('\n');

  // System message
  const systemMessage = {
    role: 'system',
    content: `You are Panlo, an intelligent AI assistant specialized in document management and information retrieval for enterprise teams.

CORE IDENTITY:
- Name: Panlo
- Purpose: Help users find, understand, and work with their organization's documents
- Context: You're assisting in a team/organization environment where documents may be shared

FUNDAMENTAL RULES:

1. LANGUAGE MATCHING (CRITICAL):
   - Always respond in the SAME language as the user's query
   - Preserve language consistency throughout the entire response

2. CONTEXT AWARENESS:
   - Understand implicit references ("translate it", "summarize that", "tell me more")
   - These refer to the most recent relevant content from provided context
   - Consider team collaboration context

3. ACCURACY OVER SPECULATION:
   - Only state information you can verify from provided sources
   - Clearly distinguish between document facts and your interpretations
   - When uncertain, ask clarifying questions

4. EFFICIENT COMMUNICATION:
   - Be concise but complete
   - Structure complex information with bullets/lists
   - Highlight key points and actionable information

5. SOURCE INTEGRITY:
   - Always cite sources you actually reference
   - Use the exact Source IDs provided in the context
   - If using general knowledge, don't cite sources

6. TEAM AWARENESS:
   - Documents may come from teammates or shared folders
   - Respect that this is a collaborative environment
   - Don't assume all documents belong to the querying user

7. SOURCE CITATION FORMAT (CRITICAL):
   - ALWAYS use "**Sources**" (in English) when citing
   - Format: "**Sources**: id-1, id-2, id-3"
   - Never translate "Sources" to other languages

Remember: Your goal is to make team document management effortless and information retrieval instant and accurate.`
  };

  // Build context header
  const contextHeader = `CONTEXT FROM ORGANIZATION'S DOCUMENTS:
${relevantText}

CONVERSATION HISTORY:
${memoryContext}

USER QUERY: ${userQuery}

---`;

  // Mode-specific instructions
  const userContent = answerMode === 'precise'
    ? `${contextHeader}
PRECISE MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE QUERY
- Identify what type of information is being requested
- Note any specific constraints (date ranges, file types, keywords)
- Consider if this is a follow-up to previous conversation
- IMPORTANT: If the query uses vague references like "this file", "that document", "it", etc., the user is referring to the documents in the CONTEXT FROM ORGANIZATION'S DOCUMENTS section above

STEP 2: ANALYZE ALL SOURCES
- Read through ALL provided sources completely
- Evaluate each source's relevance score and content quality
- Note if sources contradict each other
- Identify the most authoritative/relevant sources

STEP 3: EXTRACT AND SYNTHESIZE
- Extract ONLY information that directly answers the query
- If multiple sources contain the same information, use the highest-scored source
- Preserve exact wording when extracting specific content
- If sources contradict, mention the discrepancy
- Combine information logically if it spans multiple sources

STEP 4: HANDLE EDGE CASES
- If no context provided: Clearly state "I couldn't find relevant information in your organization's documents"
- If context IS provided but query is vague: Answer based on the provided context
- If information is incomplete: Provide what's available and specify what's missing
- If clarification needed: Ask specific follow-up questions

STEP 5: FORMAT RESPONSE
- Provide clear, direct answers in the same language as the query
- Use bullet points or numbered lists for multiple items
- CRITICAL: Always cite sources using "**Sources**" (in English only)
- Format: "**Sources**: id-1, id-2, id-3"
- Do NOT use brackets around IDs

QUALITY CHECKS:
✓ Does this directly answer what was asked?
✓ Have I checked ALL sources, not just the first few?
✓ Are my citations accurate and in the correct format?
✓ Is the response in the correct language?
✓ Did I use "Sources" in English (never translated)?`
    : `${contextHeader}
GENERAL MODE INSTRUCTIONS:

STEP 1: UNDERSTAND THE REQUEST
- Determine the user's intent and desired outcome
- Check if this is a follow-up referencing previous responses
- Identify the language of the query
- IMPORTANT: If the query uses vague references like "this file", "that document", "it", etc., the user is referring to the documents in the CONTEXT FROM ORGANIZATION'S DOCUMENTS section above

STEP 2: CHOOSE INFORMATION SOURCES
Priority order:
1. Previous conversation history (for follow-ups)
2. Provided document context (for document-specific questions)
3. Your general knowledge (for context or when documents lack info)

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
- CRITICAL: If you used specific documents, cite them using "**Sources**" (in English only)
- Format: "**Sources**: id-1, id-2, id-3"
- Do NOT use brackets around IDs
- If using only general knowledge, no citation needed

QUALITY CHECKS:
✓ Have I addressed the user's actual need?
✓ Is this response helpful and actionable?
✓ Have I appropriately balanced document info with general knowledge?
✓ Is the language correct?
✓ If I cited sources, did I use "Sources" in English?`;

  // Generate response
  const messages = [
    systemMessage,
    { role: 'user', content: userContent }
  ];

  const openaiResponse = await openai.chat.completions.create({
    model: config.openai.model,
    max_tokens: 2048,
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
  const required = ['org_id', 'owner_user_id', 'doc_id', 'folder_id'];
  for (const field of required) {
    if (!metadata[field]) {
      throw new Error(`Missing required metadata field: ${field}`);
    }
  }
  
  // Normalize and set defaults
  return {
    ...metadata,
    team_ids: metadata.team_ids || [],
    visibility: metadata.visibility || 'private',
    status: metadata.status || 'active',
    chunk_no: metadata.chunk_no || 0,
    created_at: metadata.created_at || Date.now(),
    updated_at: metadata.updated_at || Date.now(),
    shared_policy_version: metadata.shared_policy_version || 1,
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

