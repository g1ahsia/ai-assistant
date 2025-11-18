# Panlo Agentic AI Implementation Guide

**Version:** 1.0  
**Last Updated:** November 2024  
**Status:** Design & Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Reasoning Capabilities Defined](#reasoning-capabilities-defined)
3. [Architecture Design](#architecture-design)
4. [Implementation Roadmap](#implementation-roadmap)
5. [Cost & Usage Controls](#cost--usage-controls)
6. [Use Case Matrix](#use-case-matrix)
7. [Technical Specifications](#technical-specifications)

---

## Overview

This document outlines the strategy for integrating **agentic AI reasoning capabilities** into Panlo, enabling multi-step task planning, tool orchestration, and complex query handling while maintaining cost efficiency.

### Key Principles

- **Reasoning models are specialists**, not default workers
- **Fast models handle 80% of queries**, reasoning handles the complex 20%
- **Provider-agnostic architecture** for flexibility
- **Cost controls built-in** at every level

---

## Reasoning Capabilities Defined

For Panlo, "reasoning" means a set of AI behaviors that go beyond simple question-answering:

### Core Capabilities

| Capability | Description | Example |
|-----------|-------------|---------|
| **Decomposition** | Break complex requests into sub-tasks | "Compare docs" → search + filter + compare + summarize |
| **Tool Use** | Call backend APIs and services | Vector search, file access, metadata queries |
| **Multi-step Planning** | Decide order and dependencies of operations | Search → rank → synthesize → suggest actions |
| **Self-checking** | Validate answers for accuracy and completeness | "Did I cite from the user's actual spaces?" |
| **Long-horizon Coherence** | Maintain context across multiple steps | Multi-turn complex analysis |

### What You Get vs. What You Build

**✅ Reasoning Model Provides:**
- Better task decomposition
- Smarter tool-call planning
- Improved multi-step coherence

**⚠️ You Must Build:**
- Controller/orchestration layer
- Tool definitions and implementations
- Cost and quota management
- Intent detection and routing

---

## Architecture Design

### System Overview

```
┌─────────────┐
│   User      │
│  Request    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│     Intent Classifier                   │
│  (Fast model: complexity detection)     │
└──────┬──────────────────────┬───────────┘
       │                      │
    Simple                 Complex
       │                      │
       ▼                      ▼
┌─────────────┐      ┌────────────────────┐
│ Fast Model  │      │ Reasoning Model    │
│ + Basic RAG │      │ + Tool Orchestra-  │
│             │      │   tion             │
└──────┬──────┘      └─────────┬──────────┘
       │                       │
       │              ┌────────▼────────┐
       │              │ Tool Execution  │
       │              │ - search_spaces │
       │              │ - get_file      │
       │              │ - list_recent   │
       │              └────────┬────────┘
       │                       │
       ▼                       ▼
┌─────────────────────────────────────────┐
│          Final Response                 │
└─────────────────────────────────────────┘
```

### Model Routing Strategy

#### Tier 1: Fast Model (Default - 80% of queries)
**Models:** GPT-4o-mini, Claude Haiku  
**Use Cases:**
- Simple Q&A with single document context
- Chatty interactions and clarifications
- Small summaries (< 5 documents)
- File metadata queries
- Direct content retrieval

**Cost:** ~$0.001 per query

#### Tier 2: Balanced Model (15% of queries)
**Models:** GPT-4o, Claude Sonnet  
**Use Cases:**
- Medium complexity synthesis
- Multi-document summaries
- Basic comparisons (2-3 sources)

**Cost:** ~$0.01 per query

#### Tier 3: Reasoning Model (5% of queries)
**Models:** Claude Reasoning, o3  
**Use Cases:**
- Complex multi-space analysis
- Decision matrices and comparisons
- Planning and strategy tasks
- Conflict detection
- Multi-step workflows with 5+ operations

**Cost:** ~$0.10-0.50 per query

### Intent Detection Logic

```javascript
// Complexity scoring heuristics
function detectComplexity(query, context) {
  let score = 0;
  
  // Keyword detection
  const complexKeywords = [
    'compare all', 'analyze', 'strategy', 'plan',
    'timeline', 'versus', 'conflict', 'decision matrix',
    'across all', 'trend', 'pattern', 'relationship'
  ];
  
  const simpleKeywords = [
    'what is', 'show me', 'get', 'find', 'latest',
    'yesterday', 'today', 'summary of'
  ];
  
  // Scoring
  if (complexKeywords.some(kw => query.toLowerCase().includes(kw))) {
    score += 10;
  }
  
  if (simpleKeywords.some(kw => query.toLowerCase().includes(kw))) {
    score -= 5;
  }
  
  // Multi-space query
  if (context.spaceIds && context.spaceIds.length > 2) {
    score += 5;
  }
  
  // Time range complexity
  if (query.match(/since|from|between|over the last \d+ (weeks|months)/)) {
    score += 5;
  }
  
  // Query length (longer = more complex)
  if (query.length > 200) {
    score += 5;
  }
  
  // Classification
  if (score >= 15) return 'reasoning';
  if (score >= 8) return 'balanced';
  return 'fast';
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

#### 1.1 Create LLM Provider Abstraction

**File:** `llmClient.js`

```javascript
// ============================================
// Unified LLM Client
// ============================================

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import config from './config-enterprise.js';

class LLMClient {
  constructor() {
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    
    // Model mapping
    this.models = {
      fast: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        costPer1kTokens: 0.00015,
      },
      balanced: {
        provider: 'openai',
        model: 'gpt-4o',
        costPer1kTokens: 0.0025,
      },
      reasoning: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022', // or future reasoning model
        costPer1kTokens: 0.015,
      },
    };
  }
  
  /**
   * Unified chat interface
   * @param {Object} options
   * @param {string} options.model - 'fast' | 'balanced' | 'reasoning'
   * @param {Array} options.messages - Chat messages
   * @param {Array} options.tools - Tool definitions (optional)
   * @param {number} options.maxTokens - Max response tokens
   */
  async chat({ model = 'fast', messages, tools, maxTokens = 4096, temperature = 0.7 }) {
    const modelConfig = this.models[model];
    const provider = modelConfig.provider;
    
    if (provider === 'openai') {
      return await this.chatOpenAI({ 
        model: modelConfig.model, 
        messages, 
        tools, 
        maxTokens,
        temperature 
      });
    } else if (provider === 'anthropic') {
      return await this.chatAnthropic({ 
        model: modelConfig.model, 
        messages, 
        tools, 
        maxTokens,
        temperature 
      });
    }
    
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  async chatOpenAI({ model, messages, tools, maxTokens, temperature }) {
    const params = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };
    
    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => this.convertToOpenAITool(tool));
      params.tool_choice = 'auto';
    }
    
    const response = await this.openai.chat.completions.create(params);
    
    return {
      content: response.choices[0].message.content,
      toolCalls: response.choices[0].message.tool_calls || [],
      usage: response.usage,
      model: response.model,
    };
  }
  
  async chatAnthropic({ model, messages, tools, maxTokens, temperature }) {
    // Convert messages format (Anthropic uses different structure)
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    const params = {
      model,
      system: systemMessages.map(m => m.content).join('\n'),
      messages: conversationMessages,
      max_tokens: maxTokens,
      temperature,
    };
    
    if (tools && tools.length > 0) {
      params.tools = tools.map(tool => this.convertToAnthropicTool(tool));
    }
    
    const response = await this.anthropic.messages.create(params);
    
    return {
      content: response.content[0].text,
      toolCalls: response.content.filter(c => c.type === 'tool_use'),
      usage: response.usage,
      model: response.model,
    };
  }
  
  // Tool format converters
  convertToOpenAITool(tool) {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
  
  convertToAnthropicTool(tool) {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }
  
  // Calculate cost
  calculateCost(model, usage) {
    const modelConfig = this.models[model];
    const inputCost = (usage.prompt_tokens / 1000) * modelConfig.costPer1kTokens;
    const outputCost = (usage.completion_tokens / 1000) * modelConfig.costPer1kTokens * 3; // Output usually 3x
    return inputCost + outputCost;
  }
}

export default new LLMClient();
```

#### 1.2 Define Tool Schema

**File:** `agentTools.js`

```javascript
// ============================================
// Agent Tool Definitions
// ============================================

export const tools = [
  {
    name: 'search_spaces',
    description: 'Search for documents across one or more spaces using semantic search',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        spaceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of space IDs to search in',
        },
        topK: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10,
        },
      },
      required: ['query', 'spaceIds'],
    },
  },
  
  {
    name: 'get_file_content',
    description: 'Retrieve the full content of a specific document',
    parameters: {
      type: 'object',
      properties: {
        docId: {
          type: 'string',
          description: 'Document ID',
        },
        chunkRange: {
          type: 'object',
          properties: {
            start: { type: 'number' },
            end: { type: 'number' },
          },
          description: 'Optional chunk range to retrieve',
        },
      },
      required: ['docId'],
    },
  },
  
  {
    name: 'list_recent_files',
    description: 'List recently modified or added files in spaces',
    parameters: {
      type: 'object',
      properties: {
        spaceIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Space IDs to search in',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back',
          default: 7,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of files',
          default: 20,
        },
      },
      required: ['spaceIds'],
    },
  },
  
  {
    name: 'get_file_metadata',
    description: 'Get metadata about specific documents (title, author, date, etc)',
    parameters: {
      type: 'object',
      properties: {
        docIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of document IDs',
        },
      },
      required: ['docIds'],
    },
  },
  
  {
    name: 'compare_documents',
    description: 'Compare content between multiple documents and highlight differences',
    parameters: {
      type: 'object',
      properties: {
        docIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document IDs to compare (2-5 documents)',
        },
        comparisonType: {
          type: 'string',
          enum: ['content', 'metadata', 'timeline', 'authors'],
          description: 'Type of comparison to perform',
        },
      },
      required: ['docIds'],
    },
  },
];

// Tool execution handlers
export const toolHandlers = {
  async search_spaces(db, orgId, userId, params) {
    const { query, spaceIds, topK = 10 } = params;
    
    // Call existing search functionality
    const chatbotClient = await import('./chatbotClient-enterprise.js');
    const matches = await chatbotClient.queryWithAuth(db, orgId, userId, query, {
      additionalFilters: {
        space_ids: spaceIds.length === 1 ? spaceIds[0] : { $in: spaceIds },
      },
      topK,
    });
    
    return {
      results: matches.map(m => ({
        docId: m.metadata.doc_id,
        filename: m.metadata.filename,
        text: m.metadata.text,
        score: m.score,
      })),
      count: matches.length,
    };
  },
  
  async get_file_content(db, orgId, userId, params) {
    const { docId, chunkRange } = params;
    
    // Query all chunks for this document
    const [rows] = await db.query(
      `SELECT doc_id, filename, filepath, mime 
       FROM space_files 
       WHERE doc_id = ? AND org_id = ?`,
      [docId, orgId]
    );
    
    if (rows.length === 0) {
      throw new Error('Document not found');
    }
    
    // Get vectors for this document
    const chatbotClient = await import('./chatbotClient-enterprise.js');
    // Implementation to fetch document chunks...
    
    return {
      docId,
      filename: rows[0].filename,
      content: '...' // Aggregated chunks
    };
  },
  
  async list_recent_files(db, orgId, userId, params) {
    const { spaceIds, days = 7, limit = 20 } = params;
    
    const placeholders = spaceIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT sf.doc_id, sf.filename, sf.filepath, sf.mime, sf.updated_at, s.space_name
       FROM space_files sf
       JOIN spaces s ON sf.space_id = s.space_id
       WHERE sf.space_id IN (${placeholders})
         AND sf.org_id = ?
         AND sf.updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY sf.updated_at DESC
       LIMIT ?`,
      [...spaceIds, orgId, days, limit]
    );
    
    return {
      files: rows,
      count: rows.length,
    };
  },
  
  async get_file_metadata(db, orgId, userId, params) {
    const { docIds } = params;
    
    const placeholders = docIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT doc_id, filename, filepath, mime, size, owner_user_id, created_at, updated_at
       FROM space_files
       WHERE doc_id IN (${placeholders}) AND org_id = ?`,
      [...docIds, orgId]
    );
    
    return { documents: rows };
  },
  
  async compare_documents(db, orgId, userId, params) {
    const { docIds, comparisonType = 'content' } = params;
    
    // Get document contents
    const docs = await Promise.all(
      docIds.map(docId => this.get_file_content(db, orgId, userId, { docId }))
    );
    
    // Return structured comparison data
    return {
      documents: docs,
      comparisonType,
      summary: 'Documents retrieved for comparison',
    };
  },
};
```

#### 1.3 Add Intent Classifier Endpoint

**File:** `express-enterprise.js` (add this endpoint)

```javascript
/**
 * POST /api/orgs/:orgId/classify-intent
 * Classify query complexity and recommend model tier
 */
app.post('/api/orgs/:orgId/classify-intent', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { query, spaceIds = [], documentIds = [] } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  
  try {
    // Heuristic-based classification
    let score = 0;
    
    // Complex keywords
    const complexKeywords = [
      'compare all', 'analyze', 'strategy', 'plan', 'timeline',
      'versus', 'vs', 'conflict', 'decision matrix', 'across all',
      'trend', 'pattern', 'relationship', 'synthesize', 'comprehensive'
    ];
    
    const simpleKeywords = [
      'what is', 'show me', 'get', 'find', 'latest', 'yesterday',
      'today', 'list', 'display', 'open'
    ];
    
    // Scoring
    if (complexKeywords.some(kw => query.toLowerCase().includes(kw))) {
      score += 10;
    }
    
    if (simpleKeywords.some(kw => query.toLowerCase().includes(kw))) {
      score -= 5;
    }
    
    // Multi-space query
    if (spaceIds.length > 2) {
      score += 5;
    }
    
    // Multi-document query
    if (documentIds.length > 5) {
      score += 5;
    }
    
    // Time range complexity
    if (query.match(/since|from|between|over the last \d+ (weeks|months|years)/)) {
      score += 5;
    }
    
    // Query length
    if (query.length > 200) {
      score += 5;
    } else if (query.length < 50) {
      score -= 3;
    }
    
    // Classify
    let tier, estimatedCost, estimatedTime;
    
    if (score >= 15) {
      tier = 'reasoning';
      estimatedCost = 0.25;
      estimatedTime = '15-30 seconds';
    } else if (score >= 8) {
      tier = 'balanced';
      estimatedCost = 0.01;
      estimatedTime = '5-10 seconds';
    } else {
      tier = 'fast';
      estimatedCost = 0.001;
      estimatedTime = '2-5 seconds';
    }
    
    res.json({
      tier,
      score,
      estimatedCost,
      estimatedTime,
      reasoning: `Query complexity score: ${score}`,
    });
    
  } catch (error) {
    console.error('Error classifying intent:', error);
    res.status(500).json({ error: 'Failed to classify intent' });
  }
});
```

### Phase 2: Agent Loop (Week 3)

#### 2.1 Create Agent Controller

**File:** `agentController.js`

```javascript
// ============================================
// Agent Controller
// Orchestrates multi-step reasoning tasks
// ============================================

import llmClient from './llmClient.js';
import { tools, toolHandlers } from './agentTools.js';

class AgentController {
  constructor(db, orgId, userId) {
    this.db = db;
    this.orgId = orgId;
    this.userId = userId;
    this.maxIterations = 5;
    this.conversationHistory = [];
  }
  
  /**
   * Execute agentic workflow
   * @param {string} userQuery - User's question
   * @param {string} model - Model tier to use
   * @returns {Object} Final response with citations
   */
  async execute(userQuery, model = 'reasoning') {
    this.conversationHistory = [
      {
        role: 'system',
        content: `You are Panlo, an AI assistant with access to organizational documents and spaces.
        
Your capabilities:
- Search across multiple spaces for relevant documents
- Retrieve and analyze file contents
- Compare documents and identify patterns
- List recent changes and updates
- Provide structured, well-cited answers

When answering:
1. Break complex queries into steps
2. Use tools to gather information
3. Synthesize findings clearly
4. Always cite specific documents (filename, space)
5. Be concise but thorough

Available tools: ${tools.map(t => t.name).join(', ')}`,
      },
      {
        role: 'user',
        content: userQuery,
      },
    ];
    
    let iteration = 0;
    let totalCost = 0;
    
    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`\n🤖 Agent iteration ${iteration}/${this.maxIterations}`);
      
      // Call LLM with tools
      const response = await llmClient.chat({
        model,
        messages: this.conversationHistory,
        tools,
        maxTokens: 4096,
      });
      
      totalCost += llmClient.calculateCost(model, response.usage);
      
      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return {
          answer: response.content,
          iterations: iteration,
          cost: totalCost,
          model,
        };
      }
      
      // Execute tool calls
      const toolResults = await this.executeTools(response.toolCalls);
      
      // Add assistant message with tool calls
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      });
      
      // Add tool results
      toolResults.forEach(result => {
        this.conversationHistory.push({
          role: 'tool',
          tool_call_id: result.id,
          content: JSON.stringify(result.output),
        });
      });
    }
    
    // Max iterations reached - return what we have
    console.warn('⚠️ Max iterations reached');
    return {
      answer: 'Analysis incomplete - reached maximum steps. Try breaking down your query.',
      iterations: iteration,
      cost: totalCost,
      model,
    };
  }
  
  /**
   * Execute tool calls in parallel
   */
  async executeTools(toolCalls) {
    const results = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolName = toolCall.function?.name || toolCall.name;
        const toolParams = JSON.parse(toolCall.function?.arguments || toolCall.input);
        
        console.log(`  🔧 Executing tool: ${toolName}`);
        console.log(`     Params:`, toolParams);
        
        try {
          const handler = toolHandlers[toolName];
          if (!handler) {
            throw new Error(`Unknown tool: ${toolName}`);
          }
          
          const output = await handler(this.db, this.orgId, this.userId, toolParams);
          
          return {
            id: toolCall.id,
            name: toolName,
            output,
          };
        } catch (error) {
          console.error(`  ❌ Tool execution failed:`, error);
          return {
            id: toolCall.id,
            name: toolName,
            output: { error: error.message },
          };
        }
      })
    );
    
    return results;
  }
}

export default AgentController;
```

#### 2.2 Add Agent Chat Endpoint

**File:** `express-enterprise.js`

```javascript
/**
 * POST /api/orgs/:orgId/agent-chat
 * Agentic chat with multi-step reasoning and tool use
 */
app.post('/api/orgs/:orgId/agent-chat', authenticateToken, verifyOrgMembership, async (req, res) => {
  const { orgId } = req.params;
  const { userId } = req.user;
  const { query, model = 'reasoning', chatId } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  
  // Check user's plan allows reasoning
  const [users] = await pool.query(
    'SELECT plan FROM organizations WHERE org_id = ?',
    [orgId]
  );
  
  const plan = users[0]?.plan || 'free';
  
  if (model === 'reasoning' && plan === 'free') {
    return res.status(403).json({
      error: 'Reasoning mode requires Pro or Enterprise plan',
      upgrade: true,
    });
  }
  
  try {
    // Initialize agent
    const AgentController = (await import('./agentController.js')).default;
    const agent = new AgentController(pool, orgId, userId);
    
    // Execute agentic workflow
    const result = await agent.execute(query, model);
    
    // Save to chat if chatId provided
    if (chatId) {
      // Save user message
      await pool.query(
        `INSERT INTO messages (message_id, chat_id, role, content, created_by)
         VALUES (?, ?, 'user', ?, ?)`,
        [`msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, chatId, query, userId]
      );
      
      // Save assistant message
      await pool.query(
        `INSERT INTO messages (message_id, chat_id, role, content, created_by, metadata)
         VALUES (?, ?, 'assistant', ?, 'system', ?)`,
        [
          `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatId,
          result.answer,
          JSON.stringify({
            model: result.model,
            iterations: result.iterations,
            cost: result.cost,
          }),
        ]
      );
    }
    
    // Log usage for billing
    await pool.query(
      `INSERT INTO usage_logs (org_id, user_id, operation, model, cost, tokens, created_at)
       VALUES (?, ?, 'agent_chat', ?, ?, 0, NOW())`,
      [orgId, userId, result.model, result.cost]
    );
    
    res.json({
      answer: result.answer,
      metadata: {
        model: result.model,
        iterations: result.iterations,
        cost: result.cost,
      },
    });
    
  } catch (error) {
    console.error('Error in agent chat:', error);
    res.status(500).json({ error: 'Failed to process agentic query' });
  }
});
```

### Phase 3: Usage Controls (Week 4)

#### 3.1 Database Schema for Usage Tracking

```sql
-- Usage logs table
CREATE TABLE usage_logs (
  log_id VARCHAR(255) PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  cost DECIMAL(10, 6) NOT NULL,
  tokens INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (org_id) REFERENCES organizations(org_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  INDEX idx_org_date (org_id, created_at),
  INDEX idx_user_date (user_id, created_at)
);

-- Monthly usage quotas
CREATE TABLE usage_quotas (
  org_id VARCHAR(255) PRIMARY KEY,
  plan VARCHAR(50) NOT NULL,
  reasoning_queries_limit INT DEFAULT 0,
  reasoning_queries_used INT DEFAULT 0,
  monthly_cost_limit DECIMAL(10, 2) DEFAULT 0,
  monthly_cost_used DECIMAL(10, 2) DEFAULT 0,
  reset_date DATE NOT NULL,
  
  FOREIGN KEY (org_id) REFERENCES organizations(org_id)
);
```

#### 3.2 Usage Middleware

**File:** `usageMiddleware.js`

```javascript
// ============================================
// Usage Quota Middleware
// ============================================

export async function checkUsageQuota(req, res, next) {
  const { orgId } = req.params;
  const { model = 'fast' } = req.body;
  
  // Only check for reasoning queries
  if (model !== 'reasoning') {
    return next();
  }
  
  try {
    // Get quota for this org
    const [quotas] = await req.app.locals.db.query(
      `SELECT * FROM usage_quotas WHERE org_id = ?`,
      [orgId]
    );
    
    if (quotas.length === 0) {
      // Initialize quota based on plan
      const [orgs] = await req.app.locals.db.query(
        'SELECT plan FROM organizations WHERE org_id = ?',
        [orgId]
      );
      
      const plan = orgs[0]?.plan || 'free';
      const limits = getQuotaLimits(plan);
      
      await req.app.locals.db.query(
        `INSERT INTO usage_quotas (org_id, plan, reasoning_queries_limit, monthly_cost_limit, reset_date)
         VALUES (?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 1 MONTH))`,
        [orgId, plan, limits.reasoningQueries, limits.monthlyCost]
      );
      
      return next();
    }
    
    const quota = quotas[0];
    
    // Check if quota exceeded
    if (quota.reasoning_queries_used >= quota.reasoning_queries_limit) {
      return res.status(429).json({
        error: 'Reasoning query limit reached for this month',
        quota: {
          limit: quota.reasoning_queries_limit,
          used: quota.reasoning_queries_used,
          resetDate: quota.reset_date,
        },
        upgrade: true,
      });
    }
    
    // Increment usage
    await req.app.locals.db.query(
      `UPDATE usage_quotas 
       SET reasoning_queries_used = reasoning_queries_used + 1
       WHERE org_id = ?`,
      [orgId]
    );
    
    next();
    
  } catch (error) {
    console.error('Error checking usage quota:', error);
    next(); // Allow request to proceed on error
  }
}

function getQuotaLimits(plan) {
  const limits = {
    free: {
      reasoningQueries: 0,
      monthlyCost: 0,
    },
    pro: {
      reasoningQueries: 100,
      monthlyCost: 50,
    },
    enterprise: {
      reasoningQueries: -1, // unlimited
      monthlyCost: -1,
    },
  };
  
  return limits[plan] || limits.free;
}
```

---

## Cost & Usage Controls

### Quota Tiers

| Plan | Fast Model | Balanced Model | Reasoning Model | Monthly Cost Cap |
|------|-----------|---------------|----------------|------------------|
| **Free** | Unlimited | 50/month | ❌ Not available | $5 |
| **Pro** | Unlimited | Unlimited | 100/month | $50 |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Custom |

### UI Controls

#### Mode Selector
```html
<div class="chat-mode-selector">
  <button class="mode-btn active" data-mode="fast">
    ⚡ Quick Answer
    <span class="mode-desc">Fast, simple queries</span>
  </button>
  
  <button class="mode-btn" data-mode="reasoning" data-premium="true">
    🧠 Deep Analysis
    <span class="mode-desc">Complex, multi-step reasoning</span>
    <span class="mode-cost">~$0.25 per query</span>
  </button>
</div>
```

#### Usage Dashboard
```html
<div class="usage-stats">
  <h3>Usage This Month</h3>
  
  <div class="usage-item">
    <span>Reasoning Queries</span>
    <div class="progress-bar">
      <div class="progress" style="width: 45%"></div>
    </div>
    <span>45 / 100</span>
  </div>
  
  <div class="usage-item">
    <span>Cost</span>
    <div class="progress-bar">
      <div class="progress" style="width: 28%"></div>
    </div>
    <span>$14.20 / $50</span>
  </div>
</div>
```

---

## Use Case Matrix

### ✅ Use Reasoning Model For:

| Use Case | Example Query | Why Reasoning? |
|----------|--------------|----------------|
| Cross-space synthesis | "Compare Q3 reports from Sales and Engineering" | Requires multi-space search + analysis |
| Decision support | "What are the conflicts between the Product and Legal docs?" | Pattern detection across documents |
| Planning tasks | "Create a study plan based on all course materials" | Multi-step organization |
| Timeline analysis | "What changed in our strategy over the last 6 months?" | Temporal analysis + synthesis |
| Complex comparisons | "Version compare all drafts of the proposal" | Deep content analysis |

### ❌ Don't Use Reasoning Model For:

| Use Case | Example Query | Use Instead |
|----------|--------------|-------------|
| Simple lookup | "Show me yesterday's meeting notes" | Fast model + basic search |
| Direct retrieval | "Open the Q4 budget spreadsheet" | No AI needed, just file access |
| General knowledge | "What is project management?" | Fast model (no context needed) |
| Single doc summary | "Summarize this PDF" | Balanced model |
| Formatting | "Translate this to Spanish" | Fast model |

---

## Technical Specifications

### Performance Targets

| Metric | Fast Model | Balanced Model | Reasoning Model |
|--------|-----------|---------------|----------------|
| **Response Time** | < 3s | < 8s | < 30s |
| **Cost per Query** | $0.001 | $0.01 | $0.10-0.50 |
| **Token Limit** | 4K | 8K | 16K |
| **Tool Calls** | 0-1 | 1-2 | 2-5 |
| **Accuracy Target** | 85% | 92% | 98% |

### Error Handling

```javascript
// Graceful degradation strategy
async function executeQuery(query, preferredModel) {
  try {
    return await llmClient.chat({ model: preferredModel, ... });
  } catch (error) {
    if (error.code === 'RATE_LIMIT' || error.code === 'QUOTA_EXCEEDED') {
      // Fall back to cheaper model
      console.warn(`Falling back from ${preferredModel} to fast model`);
      return await llmClient.chat({ model: 'fast', ... });
    }
    throw error;
  }
}
```

### Monitoring & Alerts

```javascript
// Log all reasoning model usage
function logReasoningUsage(orgId, userId, cost, iterations) {
  // Send to analytics
  analytics.track({
    event: 'reasoning_query',
    orgId,
    userId,
    cost,
    iterations,
    timestamp: new Date(),
  });
  
  // Alert if cost anomaly
  if (cost > 1.0) {
    alertSlack(`High cost query detected: $${cost} for org ${orgId}`);
  }
}
```

---

## Next Steps

### Immediate Actions (This Week)
- [ ] Set up Anthropic API key
- [ ] Implement `llmClient.js` abstraction
- [ ] Define initial tool set (search, get_file, list_recent)
- [ ] Add usage_logs table to database

### Short Term (Next 2 Weeks)
- [ ] Build agent controller with tool execution
- [ ] Add `/agent-chat` endpoint
- [ ] Implement intent classifier
- [ ] Create usage quota middleware

### Medium Term (Next Month)
- [ ] Add UI mode selector (Fast vs Reasoning)
- [ ] Build usage dashboard
- [ ] Add more tools (compare, analyze, timeline)
- [ ] Performance optimization

### Long Term (Next Quarter)
- [ ] Multi-turn conversation memory
- [ ] Custom tool creation by admins
- [ ] Advanced planning strategies
- [ ] Cross-org knowledge sharing (for enterprise)

---

## References

- [Anthropic Claude API Docs](https://docs.anthropic.com/)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [LangChain Agent Docs](https://python.langchain.com/docs/modules/agents/)
- Panlo Architecture Docs: `PANLO-ENTERPRISE-UX-WORKFLOW.md`