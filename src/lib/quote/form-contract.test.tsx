import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import QuoteForm from '../../components/quote/QuoteForm';

describe('three-stage quote entry', () => {
  it('starts with location and room choice together', () => {
    const html = renderToStaticMarkup(<QuoteForm />);
    expect(html.includes('Step 1 of 3')).toBe(true);
    expect(html.includes('City or postal code')).toBe(true);
    expect(html.includes('Basement')).toBe(true);
  });
});
