from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # 访问结果页面
    page.goto('http://localhost:3080/result/3b65cd69-36ec-4b83-8d77-5a24a40e334b')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)
    
    # 截图
    page.screenshot(path='/tmp/result_page.png', full_page=True)
    
    # 检查页面内容
    content = page.content()
    
    # 查找数据表格
    tables = page.locator('table')
    print(f'表格数量: {tables.count()}')
    
    # 查找行
    rows = page.locator('tr')
    print(f'行数量: {rows.count()}')
    
    # 查找文本内容
    body_text = page.locator('body').inner_text()
    print(f'页面文本（前1000字符）: {body_text[:1000]}')
    
    browser.close()
