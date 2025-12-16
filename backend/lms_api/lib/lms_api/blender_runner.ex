defmodule LmsApi.BlenderRunner do
  @moduledoc """
  Runs Blender in headless mode to export or render assets.

  Usage examples:
    LmsApi.BlenderRunner.render_blend("C:/path/to/file.blend", "C:/output/out.glb")
  """

  @default_blender_path "C:/Program Files/Blender Foundation/Blender/blender.exe"

  def blender_path do
    Application.get_env(:lms_api, :blender_path, @default_blender_path)
  end

  @doc "Run Blender with a .blend file and a script to export. Returns `{:ok, output}` or `{:error, reason}`."
  def render_blend(blend_file, output_path, script \\ "ops/blender/render_export.py") do
    blender = blender_path()

    if not File.exists?(blend_file) do
      {:error, :blend_not_found}
    else
      args = ["-b", blend_file, "-P", script, "--", output_path]

      case System.cmd(blender, args, stderr_to_stdout: true, into: "") do
        {out, 0} -> {:ok, out}
        {out, code} -> {:error, {:exit, code, out}}
      end
    end
  end
end
