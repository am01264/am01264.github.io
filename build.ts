import {parse, PropertyKind} from "./front-matter-parser.ts"
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

    // Set date
    const fileDate = /^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}Z)?/.exec(file.name)?.[0];

    // Set title
    let fileTitle = 
        (fileDate ? file.name.substring(fileDate.length).replace(/^(-|\s+)/, '') : file.name)
        .replace(/.md$/, '')
        .replace(/-/, ' ');

    // Generate Jekyll-style URL
    let fileURL = '';
    
    if (fileDate) {
        const dtDate = new Date(fileDate);
        fileURL += `/${ dtDate.getFullYear().toString().padStart(4,'0') }/${ (dtDate.getMonth() + 1).toString().padStart(2,'0') }/${ dtDate.getDate().toString().padStart(2,'0') }`
    }

    fileURL += `/${ fileTitle.replaceAll(/ /g,'-') }.html`

    const props = [
        {
            property: "date",
            type: PropertyKind.Line,
            defaultsTo: fileDate
        },
        { 
            property: "published", 
            type: PropertyKind.Boolean,
            defaultsTo: "false" 
        },
        { 
            property: "tags", 
            type: PropertyKind.List,
            defaultsTo: [] 
        },
        { 
            property: "title", 
            type: PropertyKind.Line,
            defaultsTo: fileTitle 
        },
        { 
            property: "description", 
            type: PropertyKind.Paragraph,
            defaultsTo: "This post doesn't have a description listed, let's call it a mystery." },
        { 
            property: "layout", 
            type: PropertyKind.Identifier,
            defaultsTo: 'post' 
        },
        { 
            property: "author", 
            type: PropertyKind.Line,
            defaultsTo: 'Andrew McAuley' 
        },
        {
            property: "url",
            type: PropertyKind.Line,
            defaultsTo: fileURL
        }
    ];



    // Run the parser

    console.log(file.path)
    const szDocument = await Deno.readTextFile(file.path);
    const result = parse(szDocument, props);

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

