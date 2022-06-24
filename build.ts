import {parse, FrontMatterProperties} from "./front-matter-parser.ts"
import {checkLinks} from "./link-checker.ts";

const dirBase = "./_posts";
const files = [];

for await (const inode of Deno.readDir("./_posts")) {
    if (! inode.isFile) continue;
    if (! inode.name.endsWith('.md')) continue;
    
    files.push({ ...inode,
        path: `${dirBase}/${inode.name}`,
    });
}

for (const file of files) {

    const defaults : FrontMatterProperties = {
        published: "false",
        tags: [],
        title: 'Untitled',
        description: "This post doesn't have a teaser yet.",
        layout: 'post',
        author: 'Andrew McAuley'
    };
    

    // Set date
    const date = /^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}Z)?/.exec(file.name)?.[0];
    if (date) defaults.date = date;

    // Set title
    defaults.title = (date ? file.name.substring(date.length).replace(/^(-|\s+)/, '') : file.name)
        .replace(/.md$/, '')
        .replace(/-/, ' ')
        ;

    // Generate Jekyll-style URL
    defaults.url = '';
    
    if (date) {
        const dtDate = new Date(date);
        defaults.url += `/${ dtDate.getFullYear().toString().padStart(4,'0') }/${ (dtDate.getMonth() + 1).toString().padStart(2,'0') }/${ dtDate.getDate().toString().padStart(2,'0') }`
    }

    defaults.url += `/${ defaults.title.replaceAll(/ /g,'-') }.html`

    console.log(file.path)
    const szDocument = await Deno.readTextFile(file.path);
    const result = parse(szDocument, defaults);

    let props = defaults;
    let frontMatterLength = 0;

    if (result instanceof Error) {
        console.warn(`Unable to read front matter due to errors: ${file.name}\n%o`, result);
    } else {
        props = {...defaults, ...result.meta};
        frontMatterLength = result.frontMatterLength;
    }

    const markdown = szDocument.substring(frontMatterLength);

    checkLinks(markdown, {
        abortOnFirstFail: true,
        baseURL: props.url as string,
        redirectsAllowed: false,
        timeout: 5000
    });
    
}

