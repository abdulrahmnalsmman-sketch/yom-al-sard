type Tag = 'h1' | 'h2' | 'p' | 'span' | 'strong';

type Props = {
  as?: Tag;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  className?: string;
};

export function EditableText({ as: Element = 'span', value, editing, onChange, className }: Props) {
  if (!editing) return <Element className={className}>{value}</Element>;
  return (
    <Element
      className={`${className ?? ''} editable-text`}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onChange(e.currentTarget.textContent ?? '')}
    >
      {value}
    </Element>
  );
}
