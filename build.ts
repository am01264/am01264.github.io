import {parse, FrontMatterProperties} from "./front-matter-parser.ts"

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
        description: "This post doesn't have a teaser yet",
        layout: 'post',
        author: 'Andrew McAuley'
    };
    

    const date = /^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}Z)?/.exec(file.name)?.[0];
    if (date) defaults.date = date;

    defaults.title = (date ? file.name.substring(date.length).replace(/^-/, '') : file.name)
        .replace(/.md$/, '')
        .replace(/-/, ' ')
        ;

    console.log(file.path)
    const content = await Deno.readTextFile(file.path);
    console.dir(parse(content, defaults))

}