import sys
from playwright.sync_api import sync_playwright

def test_e2e():
    print("Starting e2e test...")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        try:
            # 1. Navigate to http://localhost:4173
            print("Navigating to http://localhost:4173...")
            response = page.goto("http://localhost:4173")
            if not response or not response.ok:
                raise Exception(f"Failed to load page. Status: {response.status if response else 'Unknown'}")
            
            # 2. Verify page title or dashboard loads
            print("Verifying dashboard loads...")
            # Wait for header text
            page.wait_for_selector("text='TrafficFlow AI Dashboard'", timeout=5000)
            
            # 3. Click "Go to Sandbox" link, verify canvas loads
            print("Clicking Go to Sandbox...")
            page.click("text='Go to Sandbox'")
            page.wait_for_url("**/sandbox", timeout=5000)
            
            print("Verifying ReactFlow loads in Sandbox...")
            page.wait_for_selector(".react-flow", timeout=5000)
            
            # Navigate back to dashboard to click logs, or click directly if it's there
            print("Navigating back to root...")
            page.goto("http://localhost:4173")
            page.wait_for_selector("text='TrafficFlow AI Dashboard'", timeout=5000)
            
            # 4. Click "Debug & Logs" link, verify CV video feed
            print("Clicking Debug & Logs...")
            page.click("text='Debug & Logs'")
            page.wait_for_url("**/logs", timeout=5000)
            
            print("Verifying CV video feed...")
            # The img tag should have src="http://localhost:5001/video_feed"
            img = page.wait_for_selector('img[src="http://localhost:5001/video_feed"]', timeout=5000)
            if img:
                print("Found video feed image.")
            else:
                raise Exception("Video feed image not found.")
                
            print("All steps passed successfully!")
            return True
            
        except Exception as e:
            print(f"Error during test: {e}")
            return False
        finally:
            browser.close()

if __name__ == "__main__":
    success = test_e2e()
    if not success:
        sys.exit(1)
