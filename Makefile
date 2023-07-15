BUNDLE_PATH = "tailscale@joaophi.github.com.zip"
EXTENSION_DIR = "tailscale@joaophi.github.com"

all: build install

.PHONY: build install clean

build:
	rm -f $(BUNDLE_PATH)
	cd $(EXTENSION_DIR); \
	gnome-extensions pack --force --podir=locale \
	                      --extra-source=icons/ \
						  --extra-source=tailscale.js; \
	mv $(EXTENSION_DIR).shell-extension.zip ../$(BUNDLE_PATH)

install:
	gnome-extensions install $(BUNDLE_PATH) --force

clean:
	@rm -fv $(BUNDLE_PATH)
