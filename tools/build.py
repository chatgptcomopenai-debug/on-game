"""Сборка всей игры в один файл izbrannyi.html (модули в отдельных областях видимости)."""
import re, os, posixpath
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
order, seen = [], set()
def visit(mod):
    if mod in seen: return
    seen.add(mod)
    src = open(os.path.join(ROOT, mod)).read()
    for dep in re.findall(r"^import .*? from '(.+?)';", src, flags=re.M):
        visit(posixpath.normpath(posixpath.join(posixpath.dirname(mod), dep)))
    order.append(mod)
visit('src/main.js')
var = lambda m: '__m_' + re.sub(r'\W', '_', m)
js = []
for mod in order:
    src = open(os.path.join(ROOT, mod)).read()
    def imp(m):
        names, dep = m.group(1), m.group(2)
        dep = posixpath.normpath(posixpath.join(posixpath.dirname(mod), dep))
        names = names.strip().strip('{}').replace(' as ', ': ')
        return f'const {{{names}}} = {var(dep)};'
    src = re.sub(r"^import (.+?) from '(.+?)';", imp, src, flags=re.M)
    exports = re.findall(r'^export (?:const|let|function|class) (\w+)', src, flags=re.M)
    src = re.sub(r'^export ', '', src, flags=re.M)
    js.append(f'// ===== {mod} =====\nconst {var(mod)} = (() => {{\n{src}\nreturn {{ {", ".join(exports)} }};\n}})();')
html = open(os.path.join(ROOT, 'index.html')).read()
css = open(os.path.join(ROOT, 'style.css')).read()
peer = open(os.path.join(ROOT, 'lib/peerjs.min.js')).read()
html = re.sub(r'<link rel="stylesheet" href="style.css">', lambda _: '<style>' + css + '</style>', html)
html = re.sub(r'<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\n?', '', html)
html = html.replace('<script src="lib/peerjs.min.js"></script>', '')
html = html.replace('<script type="module" src="src/main.js"></script>',
    lambda_ := '<script>' + peer + '</script>\n<script>\n"use strict";\n' + '\n'.join(js) + '\n</script>') if False else \
    html.replace('<script type="module" src="src/main.js"></script>', '<script>' + peer + '</script>\n<script>\n"use strict";\n' + '\n'.join(js) + '\n</script>')
open(os.path.join(ROOT, 'izbrannyi.html'), 'w').write(html)
print('ok', len(html) // 1024, 'KB,', len(order), 'modules')
