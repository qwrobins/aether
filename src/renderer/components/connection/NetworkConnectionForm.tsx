import { useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConnectionType } from '@shared/types/connection';

interface NetworkConnectionFormProps {
  type: ConnectionType;
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

const labels: Partial<Record<ConnectionType, string>> = {
  smb: 'SMB Share',
  nfs: 'NFS Export',
  webdav: 'WebDAV Mount',
  ftp: 'FTP Server',
  ftps: 'FTPS Server',
  rsync: 'Rsync Target',
  'azure-blob': 'Azure Blob Storage',
  gcs: 'Google Cloud Storage',
};

export function NetworkConnectionForm({ type, formData, onChange }: NetworkConnectionFormProps) {
  const browseForMount = useCallback(async () => {
    try {
      const homePath = await window.api.invoke('fs:get-home');
      const directory = await window.api.invoke('dialog:open-directory', homePath);
      if (directory) {
        onChange('mountPath', directory);
      }
    } catch (error) {
      console.error('[Aether] Failed to browse for mount path:', error);
    }
  }, [onChange]);

  const browseForServiceAccount = useCallback(async () => {
    try {
      const homePath = await window.api.invoke('fs:get-home');
      const filePath = await window.api.invoke('dialog:open-file', {
        title: 'Select Service Account Key',
        defaultPath: homePath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        onChange('serviceAccountKeyPath', filePath);
      }
    } catch (error) {
      console.error('[Aether] Failed to browse for service account key:', error);
    }
  }, [onChange]);

  const browseForPrivateKey = useCallback(async () => {
    try {
      const homePath = await window.api.invoke('fs:get-home');
      const filePath = await window.api.invoke('dialog:open-file', {
        title: 'Select SSH Private Key',
        defaultPath: `${homePath}/.ssh`,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });
      if (filePath) {
        onChange('privateKeyPath', filePath);
      }
    } catch (error) {
      console.error('[Aether] Failed to browse for private key:', error);
    }
  }, [onChange]);

  if (type === 'azure-blob') {
    return (
      <div className="space-y-4">
        <NameField label={labels[type]} value={formData.name} onChange={onChange} />
        <div className="space-y-2">
          <Label htmlFor="azure-account">Account Name</Label>
          <Input id="azure-account" value={formData.accountName ?? ''} onChange={(e) => onChange('accountName', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="azure-container">Default Container</Label>
          <Input id="azure-container" value={formData.container ?? ''} onChange={(e) => onChange('container', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="azure-endpoint">Endpoint</Label>
          <Input id="azure-endpoint" value={formData.endpoint ?? ''} placeholder="https://account.blob.core.windows.net" onChange={(e) => onChange('endpoint', e.target.value)} />
        </div>
        <SecretField id="azure-key" label="Account Key" field="accountKey" value={formData.accountKey} onChange={onChange} />
        <SecretField id="azure-sas" label="SAS Token" field="sasToken" value={formData.sasToken} onChange={onChange} />
      </div>
    );
  }

  if (type === 'gcs') {
    return (
      <div className="space-y-4">
        <NameField label={labels[type]} value={formData.name} onChange={onChange} />
        <div className="space-y-2">
          <Label htmlFor="gcs-project">Project ID</Label>
          <Input id="gcs-project" value={formData.projectId ?? ''} onChange={(e) => onChange('projectId', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gcs-bucket">Default Bucket</Label>
          <Input id="gcs-bucket" value={formData.bucket ?? ''} onChange={(e) => onChange('bucket', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gcs-key-path">Service Account Key</Label>
          <div className="flex gap-2">
            <Input id="gcs-key-path" className="flex-1 font-mono text-[12px]" value={formData.serviceAccountKeyPath ?? ''} onChange={(e) => onChange('serviceAccountKeyPath', e.target.value)} />
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={browseForServiceAccount}>
              <FolderOpen className="h-3.5 w-3.5" />
              Browse
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'rsync') {
    return (
      <div className="space-y-4">
        <NameField label={labels[type]} value={formData.name} onChange={onChange} />
        <HostField value={formData.host} onChange={onChange} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rsync-user">Username</Label>
            <Input id="rsync-user" value={formData.username ?? ''} onChange={(e) => onChange('username', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rsync-port">SSH Port</Label>
            <Input id="rsync-port" type="number" value={formData.sshPort ?? '22'} onChange={(e) => onChange('sshPort', e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rsync-auth">Authentication</Label>
          <div id="rsync-auth" className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={formData.authMethod === 'key' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => onChange('authMethod', 'key')}
            >
              SSH Key
            </Button>
            <Button
              type="button"
              variant={formData.authMethod === 'password' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => onChange('authMethod', 'password')}
            >
              Password
            </Button>
          </div>
        </div>
        {formData.authMethod === 'key' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="rsync-key-path">Private Key Path</Label>
              <div className="flex gap-2">
                <Input id="rsync-key-path" className="flex-1 font-mono text-[12px]" value={formData.privateKeyPath ?? ''} onChange={(e) => onChange('privateKeyPath', e.target.value)} />
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={browseForPrivateKey}>
                  <FolderOpen className="h-3.5 w-3.5" />
                  Browse
                </Button>
              </div>
            </div>
            <SecretField id="rsync-passphrase" label="Passphrase" field="passphrase" value={formData.passphrase} onChange={onChange} />
          </>
        ) : (
          <SecretField id="rsync-password" label="Password" field="password" value={formData.password} onChange={onChange} />
        )}
        <PathField id="rsync-path" label="Default Path" field="defaultPath" value={formData.defaultPath} onChange={onChange} />
        <PathField id="rsync-module" label="Module" field="module" value={formData.module} onChange={onChange} />
        <PathField
          id="rsync-host-key"
          label="SSH Host Key Fingerprint"
          field="hostKeyFingerprint"
          value={formData.hostKeyFingerprint}
          onChange={onChange}
          description="Verify this SHA256 fingerprint with the server administrator."
        />
      </div>
    );
  }

  if (type === 'ftp' || type === 'ftps') {
    return (
      <div className="space-y-4">
        <NameField label={labels[type]} value={formData.name} onChange={onChange} />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <HostField value={formData.host} onChange={onChange} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ftp-port">Port</Label>
            <Input id="ftp-port" type="number" value={formData.port ?? (type === 'ftps' ? '990' : '21')} onChange={(e) => onChange('port', e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ftp-user">Username</Label>
          <Input id="ftp-user" value={formData.username ?? ''} onChange={(e) => onChange('username', e.target.value)} />
        </div>
        <SecretField id="ftp-password" label="Password" field="password" value={formData.password} onChange={onChange} />
        <PathField id="ftp-path" label="Default Path" field="defaultPath" value={formData.defaultPath} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NameField label={labels[type]} value={formData.name} onChange={onChange} />
      <HostField value={formData.host} onChange={onChange} />
      <PathField id={`${type}-share`} label={type === 'nfs' ? 'Export' : 'Share'} field="share" value={formData.share} onChange={onChange} />
      <div className="space-y-2">
        <Label htmlFor={`${type}-mount-path`}>Mount Path</Label>
        <div className="flex gap-2">
          <Input id={`${type}-mount-path`} className="flex-1 font-mono text-[12px]" value={formData.mountPath ?? ''} onChange={(e) => onChange('mountPath', e.target.value)} required />
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={browseForMount}>
            <FolderOpen className="h-3.5 w-3.5" />
            Browse
          </Button>
        </div>
      </div>
      {type !== 'nfs' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`${type}-user`}>Username</Label>
              <Input id={`${type}-user`} value={formData.username ?? ''} onChange={(e) => onChange('username', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${type}-domain`}>Domain</Label>
              <Input id={`${type}-domain`} value={formData.domain ?? ''} onChange={(e) => onChange('domain', e.target.value)} />
            </div>
          </div>
          <SecretField id={`${type}-password`} label="Password" field="password" value={formData.password} onChange={onChange} />
        </>
      )}
      <PathField id={`${type}-default-path`} label="Default Path" field="defaultPath" value={formData.defaultPath} onChange={onChange} />
    </div>
  );
}

function NameField({ label, value, onChange }: { label?: string; value?: string; onChange: (field: string, value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="network-name">Connection Name</Label>
      <Input id="network-name" placeholder={label} value={value ?? ''} onChange={(e) => onChange('name', e.target.value)} required />
    </div>
  );
}

function HostField({ value, onChange }: { value?: string; onChange: (field: string, value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="network-host">Host</Label>
      <Input id="network-host" placeholder="server.local" value={value ?? ''} onChange={(e) => onChange('host', e.target.value)} required />
    </div>
  );
}

function PathField({ id, label, field, value, onChange, description }: { id: string; label: string; field: string; value?: string; onChange: (field: string, value: string) => void; description?: string }) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={descriptionId} className="font-mono text-[12px]" value={value ?? ''} onChange={(e) => onChange(field, e.target.value)} />
      {description && <p id={descriptionId} className="text-[11px] text-muted-foreground">{description}</p>}
    </div>
  );
}

function SecretField({ id, label, field, value, onChange }: { id: string; label: string; field: string; value?: string; onChange: (field: string, value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="password" value={value ?? ''} onChange={(e) => onChange(field, e.target.value)} />
    </div>
  );
}
