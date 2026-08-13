'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PackageManagerRuntime = 'python' | 'nodejs' | 'go';

interface PackageManagerProps {
  packages: string[];
  onChange: (packages: string[]) => void;
  runtime: PackageManagerRuntime;
}

const packageManagers: Record<PackageManagerRuntime, string> = {
  python: 'pip',
  nodejs: 'npm',
  go: 'go get',
};

export function PackageManager({ packages, onChange, runtime }: PackageManagerProps) {
  const [nextPackage, setNextPackage] = useState('');

  const addPackage = () => {
    const value = nextPackage.trim();
    if (!value || packages.includes(value)) {
      return;
    }

    onChange([...packages, value]);
    setNextPackage('');
  };

  const removePackage = (packageName: string) => {
    onChange(packages.filter((pkg) => pkg !== packageName));
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">📦 Packages ({packageManagers[runtime]})</div>

      {packages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {packages.map((packageName) => (
            <span
              key={packageName}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {packageName}
              <button
                type="button"
                onClick={() => removePackage(packageName)}
                className="text-muted-foreground transition hover:text-foreground"
                aria-label={`Remove ${packageName}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={nextPackage}
          onChange={(event) => setNextPackage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addPackage();
            }
          }}
          placeholder={`Add a ${packageManagers[runtime]} package`}
        />
        <Button type="button" onClick={addPackage}>
          Add
        </Button>
      </div>
    </div>
  );
}
