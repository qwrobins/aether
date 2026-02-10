import { useState, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { S3ConnectionForm } from './S3ConnectionForm';
import { SftpConnectionForm } from './SftpConnectionForm';
import type { ConnectionProfile, ConnectionType } from '@shared/types/connection';

interface ConnectionFormProps {
  initialProfile?: ConnectionProfile;
  onSave: (data: Record<string, string> & { type: ConnectionType }) => void;
  onCancel: () => void;
  onTest: (data: Record<string, string> & { type: ConnectionType }) => Promise<boolean>;
}

const S3_DEFAULTS: Record<string, string> = {
  name: '',
  region: 'us-east-1',
  authMethod: 'credentials',
  accessKeyId: '',
  secretAccessKey: '',
  roleArn: '',
  externalId: '',
  sourceAccessKeyId: '',
  sourceSecretAccessKey: '',
  awsProfile: '',
  defaultBucket: '',
  endpoint: '',
};

const SFTP_DEFAULTS: Record<string, string> = {
  name: '',
  host: '',
  port: '22',
  username: '',
  authMethod: 'password',
  password: '',
  privateKeyPath: '',
  passphrase: '',
  defaultPath: '',
};

function profileToFormData(profile: ConnectionProfile): Record<string, string> {
  if (profile.type === 's3') {
    return {
      name: profile.name,
      region: profile.region,
      authMethod: profile.authMethod ?? 'credentials',
      accessKeyId: profile.accessKeyId ?? '',
      secretAccessKey: profile.secretAccessKey ?? '',
      roleArn: profile.roleArn ?? '',
      externalId: profile.externalId ?? '',
      sourceAccessKeyId: profile.sourceAccessKeyId ?? '',
      sourceSecretAccessKey: profile.sourceSecretAccessKey ?? '',
      awsProfile: profile.awsProfile ?? '',
      defaultBucket: profile.defaultBucket ?? '',
      endpoint: profile.endpoint ?? '',
    };
  }
  return {
    name: profile.name,
    host: profile.host,
    port: String(profile.port),
    username: profile.username,
    authMethod: profile.authMethod,
    password: profile.password ?? '',
    privateKeyPath: profile.privateKeyPath ?? '',
    passphrase: profile.passphrase ?? '',
    defaultPath: profile.defaultPath ?? '',
  };
}

type TestStatus = 'idle' | 'testing' | 'success' | 'failure';

export function ConnectionForm({ initialProfile, onSave, onCancel, onTest }: ConnectionFormProps) {
  const initialType: ConnectionType = initialProfile?.type ?? 's3';
  const [activeTab, setActiveTab] = useState<ConnectionType>(initialType);
  const [formData, setFormData] = useState<Record<string, string>>(
    initialProfile ? profileToFormData(initialProfile) : { ...S3_DEFAULTS }
  );
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  const handleTabChange = useCallback(
    (value: string) => {
      const newType = value as ConnectionType;
      if (newType === activeTab) return;
      setActiveTab(newType);
      // Reset form when switching tabs (unless editing existing profile)
      if (!initialProfile) {
        setFormData(newType === 's3' ? { ...S3_DEFAULTS } : { ...SFTP_DEFAULTS });
      }
      setTestStatus('idle');
    },
    [activeTab, initialProfile]
  );

  const handleChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setTestStatus('idle');
  }, []);

  const handleTest = useCallback(async () => {
    setTestStatus('testing');
    try {
      const ok = await onTest({ ...formData, type: activeTab });
      setTestStatus(ok ? 'success' : 'failure');
    } catch {
      setTestStatus('failure');
    }
  }, [formData, activeTab, onTest]);

  const handleSave = useCallback(() => {
    onSave({ ...formData, type: activeTab });
  }, [formData, activeTab, onSave]);

  const isValid = (() => {
    if (!formData.name) return false;
    if (activeTab === 'sftp') {
      return Boolean(formData.host && formData.username);
    }
    // S3 validation depends on auth method
    const authMethod = formData.authMethod || 'credentials';
    if (authMethod === 'credentials') return Boolean(formData.accessKeyId && formData.secretAccessKey);
    if (authMethod === 'profile') return Boolean(formData.awsProfile);
    if (authMethod === 'iam-role') return Boolean(formData.roleArn);
    return true; // default-chain needs no extra fields
  })();

  return (
    <div className="flex flex-1 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex flex-1 flex-col"
      >
        {/* Only show tabs when creating new connection */}
        {!initialProfile && (
          <TabsList className="w-full">
            <TabsTrigger value="s3" className="flex-1">S3</TabsTrigger>
            <TabsTrigger value="sftp" className="flex-1">SFTP</TabsTrigger>
          </TabsList>
        )}

        <div className="mt-4 flex-1 overflow-y-auto px-0.5">
          <TabsContent value="s3">
            <S3ConnectionForm formData={formData} onChange={handleChange} />
          </TabsContent>
          <TabsContent value="sftp">
            <SftpConnectionForm formData={formData} onChange={handleChange} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border pt-4 mt-4">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={!isValid || testStatus === 'testing'}
        >
          {testStatus === 'testing' && <Loader2 size={14} className="animate-spin" />}
          {testStatus === 'success' && <CheckCircle2 size={14} className="text-emerald-400" />}
          {testStatus === 'failure' && <XCircle size={14} className="text-destructive" />}
          {testStatus === 'idle' && null}
          Test
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!isValid}>
          {initialProfile ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
