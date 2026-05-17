import { useState, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { S3ConnectionForm } from './S3ConnectionForm';
import { SftpConnectionForm } from './SftpConnectionForm';
import { NetworkConnectionForm } from './NetworkConnectionForm';
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

const NETWORK_DEFAULTS: Record<string, string> = {
  name: '',
  host: '',
  share: '',
  mountPath: '',
  username: '',
  password: '',
  authMethod: 'password',
  privateKeyPath: '',
  passphrase: '',
  domain: '',
  defaultPath: '',
  port: '',
  sshPort: '22',
  module: '',
  accountName: '',
  accountKey: '',
  sasToken: '',
  endpoint: '',
  container: '',
  projectId: '',
  bucket: '',
  serviceAccountKeyPath: '',
};

const CONNECTION_TYPES: ConnectionType[] = [
  's3',
  'sftp',
  'smb',
  'nfs',
  'webdav',
  'ftp',
  'ftps',
  'rsync',
  'azure-blob',
  'gcs',
];

const CONNECTION_LABELS: Record<ConnectionType, string> = {
  s3: 'S3',
  sftp: 'SFTP',
  smb: 'SMB',
  nfs: 'NFS',
  webdav: 'WebDAV',
  ftp: 'FTP',
  ftps: 'FTPS',
  rsync: 'Rsync',
  'azure-blob': 'Azure',
  gcs: 'GCS',
};

function defaultsForType(type: ConnectionType): Record<string, string> {
  if (type === 's3') return { ...S3_DEFAULTS };
  if (type === 'sftp') return { ...SFTP_DEFAULTS };
  return {
    ...NETWORK_DEFAULTS,
    port: type === 'ftps' ? '990' : type === 'ftp' ? '21' : '',
  };
}

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
    ...defaultsForType(profile.type),
    ...Object.fromEntries(
      Object.entries(profile).map(([key, value]) => [key, value === undefined ? '' : String(value)]),
    ),
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
        setFormData(defaultsForType(newType));
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
    if (activeTab === 'smb' || activeTab === 'nfs' || activeTab === 'webdav') {
      return Boolean(formData.host && formData.share && formData.mountPath);
    }
    if (activeTab === 'ftp' || activeTab === 'ftps' || activeTab === 'rsync') {
      if (!formData.host || !formData.username) return false;
      if (activeTab !== 'rsync') return true;
      return formData.authMethod === 'key'
        ? Boolean(formData.privateKeyPath)
        : Boolean(formData.password);
    }
    if (activeTab === 'azure-blob') {
      return Boolean(formData.accountName && (formData.accountKey || formData.sasToken));
    }
    if (activeTab === 'gcs') {
      return Boolean(formData.serviceAccountKeyPath && (formData.projectId || formData.bucket));
    }
    // S3 validation depends on auth method
    const authMethod = formData.authMethod || 'credentials';
    if (authMethod === 'credentials') return Boolean(formData.accessKeyId && formData.secretAccessKey);
    if (authMethod === 'profile') return Boolean(formData.awsProfile);
    if (authMethod === 'iam-role') return Boolean(formData.roleArn);
    return true; // default-chain needs no extra fields
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Only show tabs when creating new connection */}
        {!initialProfile && (
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 p-1">
            {CONNECTION_TYPES.map((type) => (
              <TabsTrigger key={type} value={type} className="px-2 text-[11px]">
                {CONNECTION_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          <TabsContent value="s3">
            <S3ConnectionForm formData={formData} onChange={handleChange} />
          </TabsContent>
          <TabsContent value="sftp">
            <SftpConnectionForm formData={formData} onChange={handleChange} />
          </TabsContent>
          {CONNECTION_TYPES.filter((type) => type !== 's3' && type !== 'sftp').map((type) => (
            <TabsContent key={type} value={type}>
              <NetworkConnectionForm type={type} formData={formData} onChange={handleChange} />
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* Footer actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-border px-3 pt-4">
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
