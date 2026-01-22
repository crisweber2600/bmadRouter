import { LLMRequest, RoutingSignals } from '../types';
import { logger } from '../observability/logger';

export class PromptProcessor {
  async processPrompt(request: LLMRequest): Promise<RoutingSignals> {
    const startTime = Date.now();

    try {
      // Count tokens (simplified approximation)
      const tokenCount = this.countTokens(request);

      // Calculate complexity score
      const complexity = this.calculateComplexity(request);

      // Detect code presence
      const hasCode = this.detectCode(request);

      // Classify intent
      const intentCategory = this.classifyIntent(request);

      // Calculate confidence
      const confidence = this.calculateConfidence(complexity, hasCode, intentCategory);

      const signals: RoutingSignals = {
        tokenCount,
        complexity,
        hasCode,
        intentCategory,
        confidence,
      };

      const processingTime = Date.now() - startTime;
      logger.debug('Prompt processed', { processingTime, signals });

      return signals;

    } catch (error) {
      logger.error('Prompt processing failed', { error });
      // Return conservative defaults
      return {
        tokenCount: 100,
        complexity: 0.5,
        hasCode: false,
        intentCategory: 'mixed',
        confidence: 0.5,
      };
    }
  }

  private countTokens(request: LLMRequest): number {
    // Simplified token counting - in production, use proper tokenizer
    let totalTokens = 0;

    for (const message of request.messages) {
      // Rough approximation: ~4 characters per token
      totalTokens += Math.ceil(message.content.length / 4);

      // Add tokens for role and formatting
      totalTokens += 4; // system/user/assistant + overhead
    }

    return totalTokens;
  }

  private calculateComplexity(request: LLMRequest): number {
    let score = 0;
    let totalWeight = 0;

    for (const message of request.messages) {
      const content = message.content;

      // Length factor (0-0.3)
      const lengthScore = Math.min(content.length / 1000, 0.3);
      score += lengthScore * 0.4;
      totalWeight += 0.4;

      // Vocabulary richness (0-0.2)
      const uniqueWords = new Set(content.toLowerCase().split(/\s+/)).size;
      const totalWords = content.split(/\s+/).length;
      const vocabRichness = totalWords > 0 ? uniqueWords / totalWords : 0;
      const vocabScore = Math.min(vocabRichness * 0.5, 0.2);
      score += vocabScore * 0.3;
      totalWeight += 0.3;

      // Code markers (0-0.2)
      const codeMarkers = ['function', 'class', 'import', 'const', 'let', 'var', 'def ', 'public', 'private'];
      const codeCount = codeMarkers.reduce((count, marker) =>
        count + (content.includes(marker) ? 1 : 0), 0
      );
      const codeScore = Math.min(codeCount * 0.1, 0.2);
      score += codeScore * 0.2;
      totalWeight += 0.2;

      // Reasoning indicators (0-0.3)
      const reasoningWords = ['explain', 'why', 'how', 'analyze', 'compare', 'evaluate', 'design', 'architect'];
      const reasoningCount = reasoningWords.reduce((count, word) =>
        count + (content.toLowerCase().includes(word) ? 1 : 0), 0
      );
      const reasoningScore = Math.min(reasoningCount * 0.1, 0.3);
      score += reasoningScore * 0.1;
      totalWeight += 0.1;
    }

    return totalWeight > 0 ? Math.min(score / totalWeight, 1) : 0.5;
  }

  private detectCode(request: LLMRequest): boolean {
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /class\s+\w+/,
      /import\s+.*from/,
      /const\s+\w+\s*=/,
      /def\s+\w+\s*\(/,
      /public\s+class/,
      /package\s+\w+/,
      /#include/,
    ];

    return request.messages.some(message =>
      codePatterns.some(pattern => pattern.test(message.content))
    );
  }

  private classifyIntent(request: LLMRequest): 'factual' | 'reasoning' | 'creative' | 'code' | 'mixed' {
    const content = request.messages.map(m => m.content).join(' ').toLowerCase();

    // Code generation/query
    if (this.detectCode(request) ||
        content.includes('write code') ||
        content.includes('implement') ||
        content.includes('function') ||
        content.includes('class')) {
      return 'code';
    }

    // Reasoning tasks
    if (content.includes('explain') ||
        content.includes('analyze') ||
        content.includes('why') ||
        content.includes('how') ||
        content.includes('design') ||
        content.includes('architect')) {
      return 'reasoning';
    }

    // Creative tasks
    if (content.includes('write') ||
        content.includes('create') ||
        content.includes('generate') ||
        content.includes('story') ||
        content.includes('design')) {
      return 'creative';
    }

    // Factual queries
    if (content.includes('what is') ||
        content.includes('who is') ||
        content.includes('when') ||
        content.includes('where') ||
        content.includes('list')) {
      return 'factual';
    }

    return 'mixed';
  }

  private calculateConfidence(complexity: number, hasCode: boolean, intentCategory: string): number {
    // Base confidence from complexity analysis
    let confidence = 0.7; // Base confidence

    // Adjust for clear signals
    if (hasCode) confidence += 0.2; // Code detection is very reliable
    if (intentCategory !== 'mixed') confidence += 0.1; // Clear intent classification

    // Reduce confidence for high complexity (ambiguous)
    if (complexity > 0.8) confidence -= 0.1;

    return Math.max(0.5, Math.min(confidence, 0.95));
  }
}