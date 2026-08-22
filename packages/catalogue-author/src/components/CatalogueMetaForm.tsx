import type { DraftCatalogue } from '../model/draft';
import { LocalizedTextField } from './LocalizedTextField';

interface Props {
  readonly catalogue: DraftCatalogue;
  readonly onChange: (next: DraftCatalogue) => void;
}

export function CatalogueMetaForm({ catalogue, onChange }: Props) {
  return (
    <section className="catalogue-meta">
      <label>
        Catalogue id
        <input
          type="text"
          value={catalogue.id}
          onChange={(e) => onChange({ ...catalogue, id: e.target.value })}
          placeholder="e.g. basic-mechanics"
        />
      </label>
      <LocalizedTextField label="Name" value={catalogue.name} onChange={(next) => onChange({ ...catalogue, name: next })} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={catalogue.restricted}
          onChange={(e) => onChange({ ...catalogue, restricted: e.target.checked })}
        />
        Restricted — a statement of intent only; set this for content you do not
        have the right to redistribute. It does not change what this tool exports.
      </label>
    </section>
  );
}
