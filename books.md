---
layout: page
title: Recommended Books
---

<figure>

![Hello world](/res/patrick-tomasso-Oaqk7qqNh_c-unsplash.jpg)

<figcaption>

Photo by [Patrick Tomasso](https://unsplash.com/@impatrickt?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText)

</figcaption>
</figure>

Partially inspired by the monthly reading list published by Ryan Holiday, here is a list of books that for various reasons have caught my attention.

<ul>
{% for book in site.books %}
  <li>
    <a href="{{ book.url }}">
      {{ book.title }} - {{ book.author }}
    </a>
  </li>
{% endfor %}
</ul>