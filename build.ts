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

    const defaults = new Map();
    defaults.set("published", "false");
    defaults.set("tags", []);
    defaults.set("title", 'Untitled');
    defaults.set("description", "This post doesn't have a teaser yet.");
    defaults.set("layout", 'post');
    defaults.set("author", 'Andrew McAuley');
    

    // Set date
    const date = /^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}Z)?/.exec(file.name)?.[0];
    if (date) defaults.set("date", date);

    // Set title
    let fileTitle = 
        (date ? file.name.substring(date.length).replace(/^(-|\s+)/, '') : file.name)
        .replace(/.md$/, '')
        .replace(/-/, ' ');
    defaults.set("title", fileTitle);

    // Generate Jekyll-style URL
    let fileURL = '';
    
    if (date) {
        const dtDate = new Date(date);
        fileURL += `/${ dtDate.getFullYear().toString().padStart(4,'0') }/${ (dtDate.getMonth() + 1).toString().padStart(2,'0') }/${ dtDate.getDate().toString().padStart(2,'0') }`
    }

    fileURL += `/${ fileTitle.replaceAll(/ /g,'-') }.html`
    defaults.set("url", fileURL);

    console.log(file.path)
    const szDocument = await Deno.readTextFile(file.path);
    const result = parse(szDocument, defaults);

    let baseURL = fileURL;
    let frontMatterLength = 0;

    if (result instanceof Error) {
        console.warn(`Unable to read front matter due to errors: ${file.name}\n%o`, result);
    } else {
        baseURL = ''+result.props.get("url") || fileURL;
        frontMatterLength = result.frontMatterLength;
        console.info(result.props)
    }

    const markdown = szDocument.substring(frontMatterLength);

    checkLinks(markdown, {
        abortOnFirstFail: true,
        baseURL: baseURL,
        redirectsAllowed: false,
        timeout: 5000
    });
    
}

