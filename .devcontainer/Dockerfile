ARG FEDORA_VERSION=39
FROM fedora:${FEDORA_VERSION}

RUN dnf -y install git make gettext gnome-shell && \
    dnf clean all
