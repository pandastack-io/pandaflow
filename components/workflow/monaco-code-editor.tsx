'use client';

import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export interface MonacoCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'python' | 'javascript' | 'typescript' | 'go' | 'rust' | 'shell' | 'ruby' | 'php' | 'java';
  height?: string;
  readOnly?: boolean;
}

export function MonacoCodeEditor({
  value,
  onChange,
  language,
  height = '300px',
  readOnly = false,
}: MonacoCodeEditorProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-700">
      <span className="absolute top-2 right-2 z-10 text-xs text-zinc-500">{language}</span>
      <MonacoEditor
        height={height}
        language={language}
        theme="vs-dark"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly,
        }}
      />
    </div>
  );
}
