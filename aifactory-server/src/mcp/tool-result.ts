type TextToolContent = {
  type: 'text';
  text: string;
};

type BasicToolResult = {
  content: TextToolContent[];
  isError?: boolean;
};

export function asToolResult(payload: unknown): BasicToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function asToolErrorResult(message: string): BasicToolResult {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}
