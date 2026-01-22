import { AgentConfigManager, AgentRoutingConfig, RoutingStrategy } from '../config/agentConfig';

describe('AgentConfigManager', () => {
  let manager: AgentConfigManager;

  beforeEach(() => {
    manager = new AgentConfigManager();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const config = manager.getConfig('unknown-agent');
      expect(config.agentId).toBe('default');
      expect(config.strategy).toBe('balanced');
    });

    it('should register initial configs on creation', () => {
      const initialConfigs: AgentRoutingConfig[] = [
        { agentId: 'agent-1', strategy: 'cost-focused' },
        { agentId: 'agent-2', strategy: 'quality-focused' },
      ];
      const mgr = new AgentConfigManager(initialConfigs);
      
      expect(mgr.getConfig('agent-1').strategy).toBe('cost-focused');
      expect(mgr.getConfig('agent-2').strategy).toBe('quality-focused');
    });
  });

  describe('registerAgent', () => {
    it('should register agent with cost-focused strategy', () => {
      manager.registerAgent({ agentId: 'cost-agent', strategy: 'cost-focused' });
      const config = manager.getConfig('cost-agent');
      
      expect(config.strategy).toBe('cost-focused');
      expect(config.defaultTier).toBe('CHEAP');
      expect(config.qualityThreshold).toBe(0.75);
    });

    it('should register agent with quality-focused strategy', () => {
      manager.registerAgent({ agentId: 'quality-agent', strategy: 'quality-focused' });
      const config = manager.getConfig('quality-agent');
      
      expect(config.strategy).toBe('quality-focused');
      expect(config.defaultTier).toBe('BALANCED');
      expect(config.qualityThreshold).toBe(0.9);
    });

    it('should register agent with balanced strategy', () => {
      manager.registerAgent({ agentId: 'balanced-agent', strategy: 'balanced' });
      const config = manager.getConfig('balanced-agent');
      
      expect(config.strategy).toBe('balanced');
      expect(config.defaultTier).toBe('BALANCED');
      expect(config.qualityThreshold).toBe(0.85);
    });

    it('should register agent with custom strategy', () => {
      manager.registerAgent({ 
        agentId: 'custom-agent', 
        strategy: 'custom',
        defaultTier: 'PREMIUM',
        qualityThreshold: 0.95
      });
      const config = manager.getConfig('custom-agent');
      
      expect(config.strategy).toBe('custom');
      expect(config.defaultTier).toBe('PREMIUM');
      expect(config.qualityThreshold).toBe(0.95);
    });

    it('should merge tier overrides with defaults', () => {
      manager.registerAgent({ 
        agentId: 'merged-agent', 
        strategy: 'cost-focused',
        tierOverrides: { code: 'PREMIUM' }
      });
      const config = manager.getConfig('merged-agent');
      
      expect(config.tierOverrides?.code).toBe('PREMIUM');
      expect(config.tierOverrides?.reasoning).toBe('BALANCED');
      expect(config.tierOverrides?.factual).toBe('FREE');
    });

    it('should initialize metrics when registering agent', () => {
      manager.registerAgent({ agentId: 'metrics-agent', strategy: 'balanced' });
      const metrics = manager.getMetrics('metrics-agent');
      
      expect(metrics).toBeDefined();
      expect(metrics?.totalRequests).toBe(0);
      expect(metrics?.successfulRequests).toBe(0);
    });
  });

  describe('updateAgent', () => {
    it('should update existing agent config', () => {
      manager.registerAgent({ agentId: 'update-agent', strategy: 'balanced' });
      manager.updateAgent('update-agent', { qualityThreshold: 0.95 });
      
      const config = manager.getConfig('update-agent');
      expect(config.qualityThreshold).toBe(0.95);
      expect(config.strategy).toBe('balanced');
    });

    it('should merge tier overrides on update', () => {
      manager.registerAgent({ agentId: 'merge-agent', strategy: 'balanced' });
      manager.updateAgent('merge-agent', { tierOverrides: { code: 'PREMIUM' } });
      
      const config = manager.getConfig('merge-agent');
      expect(config.tierOverrides?.code).toBe('PREMIUM');
    });

    it('should throw error when updating non-existent agent', () => {
      expect(() => manager.updateAgent('non-existent', { strategy: 'balanced' }))
        .toThrow('Agent not found: non-existent');
    });
  });

  describe('removeAgent', () => {
    it('should remove agent and its metrics', () => {
      manager.registerAgent({ agentId: 'remove-agent', strategy: 'balanced' });
      expect(manager.getMetrics('remove-agent')).toBeDefined();
      
      manager.removeAgent('remove-agent');
      
      expect(manager.getConfig('remove-agent').agentId).toBe('default');
      expect(manager.getMetrics('remove-agent')).toBeUndefined();
    });
  });

  describe('getAllConfigs', () => {
    it('should return all registered configs', () => {
      manager.registerAgent({ agentId: 'agent-1', strategy: 'balanced' });
      manager.registerAgent({ agentId: 'agent-2', strategy: 'cost-focused' });
      
      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(2);
      expect(configs.map(c => c.agentId)).toContain('agent-1');
      expect(configs.map(c => c.agentId)).toContain('agent-2');
    });
  });

  describe('getRecommendedTier', () => {
    beforeEach(() => {
      manager.registerAgent({ agentId: 'cost-agent', strategy: 'cost-focused' });
      manager.registerAgent({ agentId: 'quality-agent', strategy: 'quality-focused' });
      manager.registerAgent({ agentId: 'balanced-agent', strategy: 'balanced' });
    });

    it('should return tier override when category matches', () => {
      const tier = manager.getRecommendedTier('cost-agent', 'code', 0.5);
      expect(tier).toBe('BALANCED');
    });

    it('should use complexity-based routing for cost-focused strategy', () => {
      expect(manager.getRecommendedTier('cost-agent', 'unknown', 0.1)).toBe('FREE');
      expect(manager.getRecommendedTier('cost-agent', 'unknown', 0.4)).toBe('CHEAP');
      expect(manager.getRecommendedTier('cost-agent', 'unknown', 0.6)).toBe('BALANCED');
      expect(manager.getRecommendedTier('cost-agent', 'unknown', 0.8)).toBe('PREMIUM');
    });

    it('should use complexity-based routing for quality-focused strategy', () => {
      expect(manager.getRecommendedTier('quality-agent', 'unknown', 0.1)).toBe('CHEAP');
      expect(manager.getRecommendedTier('quality-agent', 'unknown', 0.4)).toBe('BALANCED');
      expect(manager.getRecommendedTier('quality-agent', 'unknown', 0.6)).toBe('PREMIUM');
    });

    it('should use complexity-based routing for balanced strategy', () => {
      expect(manager.getRecommendedTier('balanced-agent', 'unknown', 0.1)).toBe('CHEAP');
      expect(manager.getRecommendedTier('balanced-agent', 'unknown', 0.5)).toBe('BALANCED');
      expect(manager.getRecommendedTier('balanced-agent', 'unknown', 0.7)).toBe('PREMIUM');
    });

    it('should handle unknown agents with default config', () => {
      const tier = manager.getRecommendedTier('unknown', 'unknown', 0.5);
      expect(tier).toBe('BALANCED');
    });
  });

  describe('shouldBypass', () => {
    it('should return false when bypass not enabled', () => {
      manager.registerAgent({ agentId: 'normal-agent', strategy: 'balanced' });
      expect(manager.shouldBypass('normal-agent')).toBe(false);
    });

    it('should return true when bypass enabled', () => {
      manager.registerAgent({ agentId: 'bypass-agent', strategy: 'balanced', bypassEnabled: true });
      expect(manager.shouldBypass('bypass-agent')).toBe(true);
    });
  });

  describe('checkBudget', () => {
    it('should allow when no budget set', () => {
      manager.registerAgent({ agentId: 'no-budget', strategy: 'balanced' });
      const result = manager.checkBudget('no-budget', 100);
      expect(result.allowed).toBe(true);
    });

    it('should allow when within daily budget', () => {
      manager.registerAgent({ 
        agentId: 'budget-agent', 
        strategy: 'balanced',
        costBudget: { dailyLimit: 10, currentSpend: 5 }
      });
      const result = manager.checkBudget('budget-agent', 3);
      expect(result.allowed).toBe(true);
    });

    it('should deny when daily budget exceeded', () => {
      manager.registerAgent({ 
        agentId: 'over-budget', 
        strategy: 'balanced',
        costBudget: { dailyLimit: 10, currentSpend: 9 }
      });
      const result = manager.checkBudget('over-budget', 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily budget exceeded');
    });

    it('should deny when monthly budget exceeded', () => {
      manager.registerAgent({ 
        agentId: 'monthly-over', 
        strategy: 'balanced',
        costBudget: { monthlyLimit: 100, currentSpend: 98 }
      });
      const result = manager.checkBudget('monthly-over', 5);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly budget exceeded');
    });
  });

  describe('recordRequest', () => {
    it('should record request metrics', () => {
      manager.registerAgent({ agentId: 'tracked', strategy: 'balanced' });
      
      manager.recordRequest('tracked', 'BALANCED', 150, 0.05, false);
      manager.recordRequest('tracked', 'CHEAP', 100, 0.10, false);
      
      const metrics = manager.getMetrics('tracked');
      expect(metrics?.totalRequests).toBe(2);
      expect(metrics?.successfulRequests).toBe(2);
      expect(metrics?.tierDistribution.BALANCED).toBe(1);
      expect(metrics?.tierDistribution.CHEAP).toBe(1);
      expect(metrics?.totalCostSavings).toBeCloseTo(0.15, 4);
    });

    it('should calculate running average latency', () => {
      manager.registerAgent({ agentId: 'latency-test', strategy: 'balanced' });
      
      manager.recordRequest('latency-test', 'BALANCED', 100, 0, false);
      manager.recordRequest('latency-test', 'BALANCED', 200, 0, false);
      manager.recordRequest('latency-test', 'BALANCED', 300, 0, false);
      
      const metrics = manager.getMetrics('latency-test');
      expect(metrics?.averageLatency).toBe(200);
    });

    it('should record override information', () => {
      manager.registerAgent({ agentId: 'override-test', strategy: 'balanced' });
      
      manager.recordRequest('override-test', 'PREMIUM', 100, 0, true, 'security');
      manager.recordRequest('override-test', 'PREMIUM', 100, 0, true, 'security');
      manager.recordRequest('override-test', 'PREMIUM', 100, 0, true, 'complexity');
      
      const metrics = manager.getMetrics('override-test');
      expect(metrics?.overrideCount).toBe(3);
      expect(metrics?.overrideReasons.security).toBe(2);
      expect(metrics?.overrideReasons.complexity).toBe(1);
    });

    it('should initialize metrics for unregistered agent', () => {
      manager.recordRequest('new-agent', 'BALANCED', 100, 0.05, false);
      
      const metrics = manager.getMetrics('new-agent');
      expect(metrics).toBeDefined();
      expect(metrics?.totalRequests).toBe(1);
    });
  });

  describe('recordOverride', () => {
    it('should record override and trigger learning', () => {
      manager.registerAgent({ agentId: 'learn-agent', strategy: 'balanced', learningEnabled: true });
      
      manager.recordOverride('learn-agent', 'complexity');
      
      const metrics = manager.getMetrics('learn-agent');
      expect(metrics?.overrideCount).toBe(1);
      expect(metrics?.overrideReasons.complexity).toBe(1);
    });

    it('should log warning when override rate is high', () => {
      manager.registerAgent({ agentId: 'high-override', strategy: 'balanced', learningEnabled: true });
      
      for (let i = 0; i < 5; i++) {
        manager.recordRequest('high-override', 'BALANCED', 100, 0, false);
      }
      for (let i = 0; i < 2; i++) {
        manager.recordOverride('high-override', 'quality');
      }
      
      const metrics = manager.getMetrics('high-override');
      expect(metrics?.overrideCount).toBe(2);
    });
  });

  describe('getAllMetrics', () => {
    it('should return all metrics as a map', () => {
      manager.registerAgent({ agentId: 'agent-a', strategy: 'balanced' });
      manager.registerAgent({ agentId: 'agent-b', strategy: 'cost-focused' });
      
      const allMetrics = manager.getAllMetrics();
      expect(allMetrics.size).toBe(2);
      expect(allMetrics.has('agent-a')).toBe(true);
      expect(allMetrics.has('agent-b')).toBe(true);
    });
  });

  describe('getOverrideAnalysis', () => {
    it('should analyze overrides for specific agent', () => {
      manager.registerAgent({ agentId: 'analysis-agent', strategy: 'balanced' });
      
      for (let i = 0; i < 10; i++) {
        manager.recordRequest('analysis-agent', 'BALANCED', 100, 0, false);
      }
      manager.recordOverride('analysis-agent', 'security');
      manager.recordOverride('analysis-agent', 'security');
      manager.recordOverride('analysis-agent', 'code-review');
      
      const analysis = manager.getOverrideAnalysis('analysis-agent');
      expect(analysis.totalOverrides).toBe(3);
      expect(analysis.overrideRate).toBeCloseTo(0.3);
      expect(analysis.topReasons[0]).toEqual(['security', 2]);
    });

    it('should analyze overrides across all agents', () => {
      manager.registerAgent({ agentId: 'agent-x', strategy: 'balanced' });
      manager.registerAgent({ agentId: 'agent-y', strategy: 'cost-focused' });
      
      manager.recordRequest('agent-x', 'BALANCED', 100, 0, false);
      manager.recordRequest('agent-y', 'CHEAP', 100, 0, false);
      manager.recordOverride('agent-x', 'security');
      manager.recordOverride('agent-y', 'security');
      
      const analysis = manager.getOverrideAnalysis();
      expect(analysis.totalOverrides).toBe(2);
      expect(analysis.topReasons.find(([r]) => r === 'security')?.[1]).toBe(2);
    });

    it('should provide recommendations for high override rate', () => {
      manager.registerAgent({ agentId: 'high-rate', strategy: 'balanced' });
      
      for (let i = 0; i < 4; i++) {
        manager.recordRequest('high-rate', 'BALANCED', 100, 0, false);
      }
      manager.recordOverride('high-rate', 'quality');
      
      const analysis = manager.getOverrideAnalysis('high-rate');
      expect(analysis.recommendations).toContain('Override rate >20% - consider switching to quality-focused strategy');
    });

    it('should provide recommendations for security overrides', () => {
      manager.registerAgent({ agentId: 'security-heavy', strategy: 'balanced' });
      
      for (let i = 0; i < 20; i++) {
        manager.recordRequest('security-heavy', 'BALANCED', 100, 0, false);
      }
      manager.recordOverride('security-heavy', 'security-review');
      
      const analysis = manager.getOverrideAnalysis('security-heavy');
      expect(analysis.recommendations).toContain('Security-related overrides detected - add security keyword detection');
    });

    it('should provide recommendations for code overrides', () => {
      manager.registerAgent({ agentId: 'code-heavy', strategy: 'balanced' });
      
      for (let i = 0; i < 20; i++) {
        manager.recordRequest('code-heavy', 'BALANCED', 100, 0, false);
      }
      manager.recordOverride('code-heavy', 'code-generation');
      
      const analysis = manager.getOverrideAnalysis('code-heavy');
      expect(analysis.recommendations).toContain('Code-related overrides detected - increase code tier defaults');
    });
  });

  describe('export/import', () => {
    it('should export and import configs', () => {
      manager.registerAgent({ agentId: 'export-agent', strategy: 'quality-focused' });
      manager.recordRequest('export-agent', 'PREMIUM', 100, 0.1, false);
      
      const exported = manager.exportConfig();
      
      const newManager = new AgentConfigManager();
      newManager.importConfig(exported);
      
      const config = newManager.getConfig('export-agent');
      expect(config.strategy).toBe('quality-focused');
      
      const metrics = newManager.getMetrics('export-agent');
      expect(metrics?.totalRequests).toBe(1);
    });

    it('should handle import with missing data gracefully', () => {
      const partialData = JSON.stringify({ configs: [] });
      manager.importConfig(partialData);
      
      expect(manager.getAllConfigs()).toHaveLength(0);
    });
  });
});
