import scrapeIt from 'scrape-it';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';

const limit = pLimit(5);
const outputFileName = path.join(__dirname, '../', 'function-data.json');

interface FormulaSimple {
  type: string;
  name: string;
  syntax: string;
  description: string;
  link: string;
}

interface Formula extends FormulaSimple {
  sampleUsage: string[];
  syntaxVariables: Array<{
    name: string;
    description: string;
  }>;
  notes: string[];
  related: string[];
}

async function getFormulaList() {
  const result = await scrapeIt<{ list: FormulaSimple[] }>(
    'https://support.google.com/docs/table/25273?hl=en',
    {
      list: {
        listItem: 'table tbody tr',

        data: {
          type: {
            selector: 'td',
            eq: 0,
          },
          name: {
            selector: 'td',
            eq: 1,
          },
          syntax: {
            selector: 'td',
            eq: 2,
          },
          description: {
            selector: 'td',
            eq: 3,
            convert: (val) => val.replace(/ Learn more\.?/, ''),
          },
          link: {
            selector: 'td a',
            attr: 'href',
            convert: (val) => {
              return val.startsWith('/')
                ? 'https://support.google.com' + val
                : val;
            },
          },
        },
      },
    }
  );
  return result.data;
}

async function getFormula(item: FormulaSimple): Promise<Formula> {
  console.log('fetching ' + item.link);

  const result = await scrapeIt<{
    sampleUsage: string[];
    syntaxVariables: Array<{ name: string; description: string }>;
    notes: string[];
    related: string[];
    otherRelated: string[];
  }>(item.link, {
    sampleUsage: {
      listItem: '.article-content-container > .cc > p > code',
      texteq: 1,
    },
    syntaxVariables: {
      listItem: '.article-content-container > .cc > ul:nth-of-type(1) > li',
      data: {
        name: {
          selector: 'code',
          eq: 0,
        },
        description: {
          selector: '',
        },
      },
    },
    notes: {
      listItem: '.article-content-container > .cc > ul:nth-of-type(2) li',
    },
    related: {
      listItem: '.article-content-container > .cc > p > a > code',
    },
    otherRelated: {
      listItem:
        '.article-content-container > .cc > ul:last-of-type > li > a > code',
    },
  });
  const {
    sampleUsage,
    related,
    otherRelated,
    syntaxVariables,
    ...rest
  } = result.data;
  sampleUsage.pop(); // last element is the usage

  return {
    ...item,
    ...rest,
    sampleUsage,
    related: [...related, ...otherRelated],
    syntaxVariables: syntaxVariables.map(({ description, name }) => {
      return {
        name,
        description: description
          .replace(name, '')
          .replace(/^ : /, '')
          .replace(/^ - /, ''),
      };
    }),
  };
}

(async () => {
  const { list } = await getFormulaList();

  const input = list.map((item) => {
    return limit(() => getFormula(item));
  });

  const formula = await Promise.all(input);

  fs.writeFileSync(outputFileName, JSON.stringify(formula));
})();
