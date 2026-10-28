import SwiftUI
import SceneKit
import UIKit

/// En modell som skal vises (Identifiable, så den kan brukes med fullScreenCover).
struct VistModell: Identifiable {
    let id = UUID()
    let url: URL
    let tittel: String
}

/// 3D-visning av rommet på svart bakgrunn. Én finger snur, to fingre zoomer og flytter.
struct ModellVisning: View {
    let modell: VistModell
    @Environment(\.dismiss) private var lukk

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Scenevisning(url: modell.url).ignoresSafeArea()
            VStack {
                HStack {
                    Text(modell.tittel).font(.headline).foregroundStyle(.white)
                    Spacer()
                    Button { lukk() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .white.opacity(0.25))
                    }
                    .accessibilityLabel("Lukk")
                }
                .padding()
                Spacer()
                Text("Dra for å snu · knip for å zoome · to fingre for å flytte")
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.6))
                    .padding(.bottom, 8)
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// SceneKit-visning av en USDZ-fil, med kameraet rettet mot midten av rommet.
struct Scenevisning: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> SCNView {
        let visning = SCNView()
        visning.backgroundColor = .black
        visning.antialiasingMode = .multisampling4X
        visning.allowsCameraControl = true
        visning.autoenablesDefaultLighting = true

        guard let scene = try? SCNScene(url: url, options: nil) else { return visning }
        scene.background.contents = UIColor.black
        visning.scene = scene

        // Ramme rundt hele modellen, og et kamera litt ovenfra og på skrå
        let (lav, hoy) = scene.rootNode.boundingBox
        let senter = SCNVector3((lav.x + hoy.x) / 2, (lav.y + hoy.y) / 2, (lav.z + hoy.z) / 2)
        let storst = max(hoy.x - lav.x, hoy.y - lav.y, hoy.z - lav.z, 1)
        let kamera = SCNNode()
        kamera.camera = SCNCamera()
        kamera.camera?.zNear = 0.01
        kamera.camera?.zFar = Double(storst) * 20
        kamera.camera?.fieldOfView = 50
        kamera.position = SCNVector3(senter.x + storst * 0.7, senter.y + storst * 1.1, senter.z + storst * 0.9)
        kamera.look(at: senter)
        scene.rootNode.addChildNode(kamera)
        visning.pointOfView = kamera

        let styring = visning.defaultCameraController
        styring.interactionMode = .orbitTurntable
        styring.target = senter
        styring.inertiaEnabled = true
        styring.maximumVerticalAngle = 89
        styring.minimumVerticalAngle = -10
        return visning
    }

    func updateUIView(_ visning: SCNView, context: Context) {}
}
