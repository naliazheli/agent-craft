import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Settings, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLlmStore } from '@/store/llm';
import { api } from '@/lib/api';

interface ApiConfigRecord {
  id: string;
  name: string;
  apiType: 'openai' | 'claude';
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

export function AgentConfig() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    apiUrl,
    apiKey,
    modelName,
    apiType,
    setConfig,
    loadFromStorage,
    history,
    currentConfigId,
    saveToHistory,
    loadFromHistory,
    deleteFromHistory,
  } = useLlmStore();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');

  useEffect(() => { loadFromStorage(); }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.llm.chat({
        messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
        apiUrl,
        apiKey,
        modelName,
        apiType: apiType as 'openai' | 'claude',
        maxTokens: 10,
      });
      setTestResult('success');
      setTestMessage(`${t('agent.config.testSuccess')}: "${res.content.substring(0, 50)}" (${res.tokensUsed} tokens)`);
    } catch (err: any) {
      setTestResult('error');
      setTestMessage(err.message || t('agent.config.testFailed'));
    }
    setTesting(false);
  };

  const handleCreateClick = () => {
    setConfigName('');
    setEditingConfigId(null);
    setConfig({
      apiType: 'openai',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4o',
    });
    setTestResult(null);
    setShowEditor(true);
  };

  const handleEditClick = async (id: string) => {
    try {
      const detail = (await api.apiConfigs.get(id)) as ApiConfigRecord;
      setEditingConfigId(id);
      setConfigName(detail.name);
      setConfig({
        apiType: detail.apiType,
        apiUrl: detail.apiUrl,
        apiKey: detail.apiKey,
        modelName: detail.modelName,
      });
      setTestResult(null);
      setShowEditor(true);
    } catch (err: any) {
      window.alert(err?.message || t('common.error'));
    }
  };

  const handleSaveConfig = async () => {
    if (!configName.trim() || !apiUrl || !apiKey || !modelName) return;

    setSaving(true);
    try {
      if (editingConfigId) {
        await api.apiConfigs.update(editingConfigId, {
          name: configName.trim(),
          apiType,
          apiUrl,
          apiKey,
          modelName,
        });
        await loadFromStorage();
      } else {
        await saveToHistory(configName.trim());
      }

      setShowEditor(false);
      setEditingConfigId(null);
      setConfigName('');
      setTestResult(null);
    } catch (err: any) {
      window.alert(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    if (!window.confirm(t('agent.config.confirmDeleteCurrent', 'Delete current LLM configuration?'))) {
      return;
    }

    try {
      await deleteFromHistory(id);
      if (editingConfigId === id) {
        setShowEditor(false);
        setEditingConfigId(null);
        setConfigName('');
      }
    } catch (err: any) {
      window.alert(err?.message || t('common.error'));
    }
  };

  return (
    <div className="container py-8 max-w-xl">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <Settings className="h-7 w-7" />
        {t('agent.config.title')}
      </h1>

      {showEditor && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">
              {editingConfigId
                ? t('agent.config.editConfig', 'Edit LLM Configuration')
                : t('agent.config.addConfig', 'Add LLM Configuration')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t('agent.config.configName', 'Configuration Name')}
              </label>
              <Input
                placeholder={t('agent.config.saveNamePlaceholder', 'Enter configuration name...')}
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t('agent.config.apiType')}</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={apiType}
                onChange={(e) => setConfig({ apiType: e.target.value as 'openai' | 'claude' })}
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="claude">Claude (Anthropic)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t('agent.config.apiUrl')}</label>
              <Input
                placeholder={apiType === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1'}
                value={apiUrl}
                onChange={(e) => setConfig({ apiUrl: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t('agent.config.apiKey')}</label>
              <Input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t('agent.config.modelName')}</label>
              <Input
                placeholder={apiType === 'openai' ? 'gpt-4o' : 'claude-3-5-sonnet-20241022'}
                value={modelName}
                onChange={(e) => setConfig({ modelName: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={handleTest} disabled={testing || !apiUrl || !apiKey || !modelName}>
                {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('agent.config.testConnection')}
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={saving || !configName.trim() || !apiUrl || !apiKey || !modelName}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingConfigId ? t('common.save', 'Save') : t('agent.config.add', 'Add')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditor(false);
                  setEditingConfigId(null);
                  setConfigName('');
                  setTestResult(null);
                }}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/agent')} className="ml-auto">
                {t('agent.config.goToAgent')}
              </Button>
            </div>

            {testResult && (
              <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${testResult === 'success' ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
                {testResult === 'success' ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{testMessage}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>{t('agent.config.configList', 'LLM Configuration List')}</span>
            <Button onClick={handleCreateClick} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('agent.config.addConfig', 'New LLM Configuration')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {t('agent.config.noHistory', 'No saved configurations yet')}
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="relative border rounded-md p-4 pr-12">
                  <button
                    type="button"
                    className="absolute top-2 right-2 h-7 w-7 rounded-full border text-muted-foreground hover:text-destructive hover:border-destructive"
                    onClick={() => handleDeleteConfig(item.id)}
                    title={t('agent.config.delete', 'Delete')}
                  >
                    ×
                  </button>

                  <div className="font-medium flex items-center gap-2">
                    <span>{item.name}</span>
                    {currentConfigId === item.id && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                        {t('agent.config.current', 'Current')}
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground mt-1">
                    {item.config.apiType === 'openai' ? 'OpenAI' : 'Claude'} • {item.config.modelName}
                  </div>

                  <div className="text-xs text-muted-foreground mt-1">
                    {item.lastUsed && `${t('agent.config.lastUsed', 'Last used')}: ${new Date(item.lastUsed).toLocaleString()}`}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => handleEditClick(item.id)}>
                      {t('common.edit', 'Edit')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => loadFromHistory(item.id)}>
                      {t('agent.config.load', 'Load')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
