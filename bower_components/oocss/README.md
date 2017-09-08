# OOCSS
A minimalist, but extra handy CSS toolkit for rapid website design

## Table of Contents
 - Panels
 - Menus
 - Embeddables
 - [Live Examples](https://rawgit.com/am01264/oocss/master/examples.html)

## Panels ([panels.css](panel.css))

### `.panel`
This is the real workhorse of this library. It creates a panel in which you can place any kind of content, even floats without it expanding outside it's bounds.
Doesn't do anything to help with absolute/relative positioning.
Behind the scenes it uses some Block Formatting Context magic to avoid the normal clearing of floats and fixed-width columns..

    <!-- Displays as "Hello                   World" -->
    <div class="panel">
        <p style="float: right">World</p>
        <p>Hello</p>
    </div>

### `.panel-left` and `.panel-right`
Both sit b-e-a-utifully to the side of any panel it's next to.
By default, it gives you an EM-width of space away from the connected panel.
    
    <!-- Displays as "Hello World" -->
    <div class="panel-left">Hello</div>
    <div class="panel">World</div>
    
    <!-- Displays as a media object (fixed-size image on left, with expandable content on right) -->
    <div class="panel">
        <div class="panel-left">
            <img src="http://gravatar.com/avatar/4cf4bc1b3618d2f73a2a290984a1129f?size=32">
        </div>
        <div class="panel">Andrew McAuley</div>
    </div>
    
[See Live Examples](https://rawgit.com/am01264/oocss/master/examples.html#panel)

## Menus ([menu.css](menu.css))

### `.menu`
Creates a menu out of a given list-like object, just tag each contained menu-item with `.menu-item`.
Defaults to a horizontal menu with natural spacing between items.

    <!-- Displays as "Link #1 Link #2" -->
    <ul class="menu">
        <li class="menu-item">Link #1</li>
        <li class="menu-item">Link #2</li>
    </ul>

### `.menu-float`
Works with the ".menu" container. Sets the menu so that each menu-item horizontally follows the next with no space in-between. 

    <!-- Displays as "Link #1Link #2" -->
    <ul class="menu menu-float">
        <li class="menu-item">Link #1</li>
        <li class="menu-item">Link #2</li>
    </ul>

### `.menu-vertical`
Works on the ".menu" container. Sets the menu so that it is aligned vertically.

    <!-- Displays as
       "Link #1
        Link #2" -->
    <ul class="menu menu-vertical">
        <li class="menu-item">Link #1</li>
        <li class="menu-item">Link #2</li>
    </ul>
        
[See Live Examples](https://rawgit.com/am01264/oocss/master/examples.html#panel)
        
## Embeddables ([aspect.css](aspect.css) and [embed.css](embed.css))

### `.aspect`
Gives an aspect ratio to otherwise freeform objects like Video, Flash and other plugins.
Defaults to 16:9 ratio.
Simply tag the otherwise adaptable-size object we want to restrict with `.adaptable`.

    <!-- Displays a test youtube video in the "widescreen" 16:9 shape:
    
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 
    
    -->
    <div class="aspect">
        <iframe class="adaptable" width="560" height="315" src="https://www.youtube.com/embed/p9JYPAcAaRE" frameborder="0" allowfullscreen></iframe>
    </div>

### `.aspect-4-3`
Works with the `.aspect` container. Sets a 4:3 ratio for an adaptable-size object.

    <!-- Displays a test youtube in the standard TV 4:3 shape:
    
        0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0
        0 0 0 0 0 0 0 0
        
    -->
    <div class="aspect aspect-4-3">
        <iframe class="adaptable" width="560" height="315" src="https://www.youtube.com/embed/p9JYPAcAaRE" frameborder="0" allowfullscreen></iframe>
    </div>

[See Live Examples](https://rawgit.com/am01264/oocss/master/examples.html#aspect)

### `.embed`
Expands a normally fixed-size embeddable object to fill the available width.
Defaults to applying this to images, videos, iframes and anything you tag with ".embed".

    <!-- Expands a fixed width image to fill the available width -->
    <div>
        <img class="embed" src="http://gravatar.com/avatar/4cf4bc1b3618d2f73a2a290984a1129f?size=32">
    </div>

*Warning* This is applied by default to the following tags:
 - `img`,
 - `audio`,
 - `video`,
 - `iframe`
 
[See Live Examples](https://rawgit.com/am01264/oocss/master/examples.html#embed)