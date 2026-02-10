import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SftpConnectionFormProps {
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
}

export function SftpConnectionForm({ formData, onChange }: SftpConnectionFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sftp-name">Connection Name</Label>
        <Input
          id="sftp-name"
          placeholder="My Server"
          value={formData.name ?? ''}
          onChange={(e) => onChange('name', e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="sftp-host">Host</Label>
          <Input
            id="sftp-host"
            placeholder="example.com"
            value={formData.host ?? ''}
            onChange={(e) => onChange('host', e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sftp-port">Port</Label>
          <Input
            id="sftp-port"
            type="number"
            placeholder="22"
            value={formData.port ?? '22'}
            onChange={(e) => onChange('port', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sftp-username">Username</Label>
        <Input
          id="sftp-username"
          placeholder="user"
          value={formData.username ?? ''}
          onChange={(e) => onChange('username', e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Authentication</Label>
        <Tabs
          value={formData.authMethod ?? 'password'}
          onValueChange={(value) => onChange('authMethod', value)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="password" className="flex-1">Password</TabsTrigger>
            <TabsTrigger value="key" className="flex-1">SSH Key</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="mt-3">
            <div className="space-y-2">
              <Label htmlFor="sftp-password">Password</Label>
              <Input
                id="sftp-password"
                type="password"
                placeholder="Enter password"
                value={formData.password ?? ''}
                onChange={(e) => onChange('password', e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="key" className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sftp-key-path">Private Key Path</Label>
              <Input
                id="sftp-key-path"
                placeholder="~/.ssh/id_rsa"
                value={formData.privateKeyPath ?? ''}
                onChange={(e) => onChange('privateKeyPath', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sftp-passphrase">Passphrase</Label>
              <Input
                id="sftp-passphrase"
                type="password"
                placeholder="Optional"
                value={formData.passphrase ?? ''}
                onChange={(e) => onChange('passphrase', e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sftp-default-path">Default Path</Label>
        <Input
          id="sftp-default-path"
          placeholder="/home/user"
          value={formData.defaultPath ?? ''}
          onChange={(e) => onChange('defaultPath', e.target.value)}
        />
      </div>
    </div>
  );
}
