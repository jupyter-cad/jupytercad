import subprocess
from pathlib import Path


def execute(cmd: str, cwd=None):
    subprocess.run(cmd.split(" "), check=True, cwd=cwd)


def install_dev():
    root_path = Path(__file__).parents[1]
    requirements_build_path = root_path / "requirements-build.txt"
    install_build_deps = f"python -m pip install -r {requirements_build_path}"
    install_js_deps = "jlpm install"
    build_js = "jlpm build"

    python_package_prefix = "python"
    python_packages = ["jupytercad_core", "jupytercad_lab", "jupytercad_app"]

    execute(install_build_deps)
    execute(install_js_deps)
    execute(build_js)
    for py_package in python_packages:
        execute(f"pip uninstall {py_package} -y")
        execute("jlpm clean:all", cwd=root_path / "python" / py_package)
        execute(f"pip install -e {python_package_prefix}/{py_package}")

        if py_package == "jupytercad_core":
            execute("jupyter server extension enable jupytercad_core")

        if py_package != "jupytercad_app":
            execute(
                f"jupyter labextension develop {python_package_prefix}/{py_package} --overwrite"
            )


if __name__ == "__main__":
    install_dev()
