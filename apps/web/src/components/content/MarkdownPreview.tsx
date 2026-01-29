'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export default function MarkdownPreview(props: { content: string }) {
  return (
    <div className="mdx text-[color:var(--fg)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}
